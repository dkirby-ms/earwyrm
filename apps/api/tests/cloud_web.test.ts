import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChildProcess, spawn } from 'node:child_process';
import { closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from 'node:fs';
import { main } from '../src/cloud_web.js';
import { upgrade_postgres_store } from '../src/bootstrap_database.js';
import { database_url_from_environment, StoreNotInitialized, validate_postgres_store } from '../src/persistence.js';

vi.mock('node:fs', async importOriginal => ({
  ...await importOriginal<typeof import('node:fs')>(),
  closeSync: vi.fn(),
  fstatSync: vi.fn(),
  lstatSync: vi.fn(),
  openSync: vi.fn(),
  readFileSync: vi.fn(),
  realpathSync: vi.fn(),
}));
vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  spawnSync: vi.fn(() => ({ status: 0 })),
  spawn: vi.fn(),
}));
vi.mock('../src/persistence.js', async importOriginal => ({
  ...await importOriginal<typeof import('../src/persistence.js')>(),
  database_url_from_environment: vi.fn(),
  validate_postgres_store: vi.fn(),
}));
vi.mock('../src/bootstrap_database.js', () => ({
  upgrade_postgres_store: vi.fn(),
}));

describe('secret-safe cloud startup diagnostics', () => {
  beforeEach(() => {
    vi.stubEnv('EARWYRM_DATA_DIR', '/mnt/private-do-not-log');
    vi.stubEnv('LYRIC_ENABLED', undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(realpathSync).mockReturnValue('/mnt/private-do-not-log');
    vi.mocked(readFileSync).mockReturnValue('1 2 0:1 / /mnt/private-do-not-log rw - cifs share rw');
    vi.mocked(openSync).mockReturnValue(3);
    const info = {
      isFile: () => true, isDirectory: () => true, isSymbolicLink: () => false,
      nlink: 1, ino: 1, dev: 1,
    };
    vi.mocked(fstatSync).mockReturnValue(info as ReturnType<typeof fstatSync>);
    vi.mocked(lstatSync).mockReturnValue(info as ReturnType<typeof lstatSync>);
    vi.mocked(database_url_from_environment).mockReturnValue('private-database-url');
    vi.mocked(validate_postgres_store).mockResolvedValue();
    vi.mocked(upgrade_postgres_store).mockResolvedValue();
    vi.mocked(spawn).mockImplementation(() => {
      const child = new ChildProcess();
      queueMicrotask(() => child.emit('exit', 0, null));
      return child;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('identifies a missing data setting without starting a worker', async () => {
    vi.stubEnv('EARWYRM_DATA_DIR', undefined);
    await expect(main()).rejects.toThrow('EARWYRM_DATA_DIR');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('stage=configuration; EARWYRM_DATA_DIR must name the mounted volume'));
    expect(spawn).not.toHaveBeenCalled();
  });
  it('identifies an unmounted volume without disclosing the path', async () => {
    vi.mocked(readFileSync).mockReturnValue('');
    await expect(main()).rejects.toThrow('not a mounted volume');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('stage=writer-lock; code=EARWYRM_DATA_NOT_MOUNTED'));
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('private-do-not-log');
    expect(spawn).not.toHaveBeenCalled();
  });
  it.each([
    [Object.assign(new Error('password=do-not-log'), { code: '28P01' }), 'code=28P01'],
    [new StoreNotInitialized('do-not-log'), 'PostgreSQL store is not initialized or is incomplete'],
    [Object.assign(new Error('do-not-log'), { code: 'do-not-log' }), 'unrecognized failure; raw error withheld'],
    [new Error('do-not-log', { cause: Object.assign(new Error('do-not-log'), { code: 'ECONNREFUSED' }) }), 'cause_code=ECONNREFUSED'],
  ])('reports database failures safely and releases the descriptor', async (error, detail) => {
    vi.mocked(upgrade_postgres_store).mockRejectedValue(error);
    await expect(main()).rejects.toBe(error);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(`stage=database-preparation; ${detail}`));
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('do-not-log');
    expect(closeSync).toHaveBeenCalledWith(3);
    expect(spawn).not.toHaveBeenCalled();
  });
  it('identifies configuration errors before database preparation', async () => {
    vi.mocked(database_url_from_environment).mockImplementation(() => { throw new TypeError('do-not-log'); });
    await expect(main()).rejects.toThrow('do-not-log');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('stage=database-configuration; unrecognized failure; raw error withheld'));
    expect(validate_postgres_store).not.toHaveBeenCalled();
    expect(closeSync).toHaveBeenCalledWith(3);
  });
  it.each(['true', 'True', ' TRUE '])('upgrades PostgreSQL with lyrics before starting the worker when LYRIC_ENABLED=%s', async enabled => {
    vi.stubEnv('LYRIC_ENABLED', enabled);
    await expect(main()).resolves.toBeUndefined();
    expect(upgrade_postgres_store).toHaveBeenCalledExactlyOnceWith('private-database-url', { include_lyrics: true });
    expect(validate_postgres_store).not.toHaveBeenCalled();
    expect(vi.mocked(upgrade_postgres_store).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(spawn).mock.invocationCallOrder[0]!);
  });
  it.each([undefined, 'false', 'False', ''])('upgrades access schema without lyrics when LYRIC_ENABLED=%s', async enabled => {
    vi.stubEnv('LYRIC_ENABLED', enabled);
    await expect(main()).resolves.toBeUndefined();
    expect(upgrade_postgres_store).toHaveBeenCalledExactlyOnceWith('private-database-url', { include_lyrics: false });
    expect(validate_postgres_store).not.toHaveBeenCalled();
    expect(vi.mocked(upgrade_postgres_store).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(spawn).mock.invocationCallOrder[0]!);
  });
  it('reports a failed worker exit and removes signal handlers', async () => {
    const terms = process.listenerCount('SIGTERM'), ints = process.listenerCount('SIGINT');
    vi.mocked(spawn).mockImplementation(() => {
      const child = new ChildProcess();
      queueMicrotask(() => child.emit('exit', null, 'SIGTERM'));
      return child;
    });
    await expect(main()).rejects.toThrow('Web worker exited on SIGTERM');
    expect(console.error).toHaveBeenCalledWith('Cloud web worker exited: status=null; signal=SIGTERM');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('stage=worker;'));
    expect(process.listenerCount('SIGTERM')).toBe(terms);
    expect(process.listenerCount('SIGINT')).toBe(ints);
    expect(closeSync).toHaveBeenCalledWith(3);
  });
  it('does not log a failure on successful worker completion', async () => {
    await expect(main()).resolves.toBeUndefined();
    expect(console.error).not.toHaveBeenCalled();
    expect(closeSync).toHaveBeenCalledWith(3);
  });
});
