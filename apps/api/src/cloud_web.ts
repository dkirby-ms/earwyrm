import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync,
} from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MelodyService } from './melody_service.js';
import { WebStorage } from './web_storage.js';
import { database_url_from_environment, validate_postgres_store } from './persistence.js';

/** Checks Linux mountinfo using its escaped path encoding, not filesystem-device heuristics. */
export function _is_mounted(data_dir: string): boolean {
  const mount = realpathSync(data_dir).replaceAll('\\', '\\134').replaceAll(' ', '\\040')
    .replaceAll('\t', '\\011').replaceAll('\n', '\\012');
  return readFileSync('/proc/self/mountinfo', 'utf8').split('\n').some(line => line.split(' ')[4] === mount);
}

/** Optional mount probe supports isolated tests; production must use the Linux mount table. */
export interface WriterLockOptions { is_mounted?: (directory: string) => boolean }

/**
 * Acquires a nonblocking util-linux flock on an inherited open-file description.
 * The caller owns the returned descriptor and must keep it open for the entire worker lifetime.
 * Rejects unmounted paths, symlink lock files, competing writers and missing flock.
 */
export function acquire_writer_lock(data_dir: string, options: WriterLockOptions = {}): number {
  if (!isAbsolute(data_dir)) throw new TypeError('EARWYRM_DATA_DIR must be an absolute mount path');
  if (!(options.is_mounted ?? _is_mounted)(data_dir)) throw new Error(`Data directory is not a mounted volume: ${data_dir}`);
  if (lstatSync(data_dir).isSymbolicLink() || !lstatSync(data_dir).isDirectory()) throw new Error('Data directory must be a real mount directory');
  const path = join(data_dir, '.earwyrm-writer.lock');
  const descriptor = openSync(path, constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
  try {
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.nlink !== 1) throw new Error('Writer lock must be a regular unlinked-from-elsewhere file');
    const result = spawnSync('flock', ['-xn', '3'], { stdio: ['ignore', 'pipe', 'pipe', descriptor] });
    if (result.error) throw new Error('The util-linux flock command is required', { cause: result.error });
    if (result.status !== 0) throw new Error('Data directory already has an active writer');
    const after = lstatSync(path);
    if (!after.isFile() || after.ino !== before.ino || after.dev !== before.dev || after.nlink !== 1) {
      throw new Error('Writer lock changed while acquiring the lock');
    }
    return descriptor;
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
}

function assert_regular(path: string): void {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error('Persistent database and marker files must be regular files');
}

function path_exists(path: string): boolean {
  try { lstatSync(path); return true; }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

/** Initializes SQLite only on a fresh store; existing markers and rollback journals are checked before mutation. */
export async function prepare_databases(data_dir: string, { database_url = null }: { database_url?: string | null } = {}): Promise<void> {
  if (database_url !== null) { await validate_postgres_store(database_url); return; }
  const root = resolve(data_dir);
  if (path_exists(root) && lstatSync(root).isSymbolicLink()) throw new Error('Data directory must not be a symlink');
  const marker = join(root, '.earwyrm-initialized');
  const databases = [join(root, 'earwyrm.sqlite3'), join(root, 'melody', 'melody.sqlite3')];
  if (path_exists(marker)) {
    assert_regular(marker);
    if (!databases.every(path => path_exists(path) && lstatSync(path).isFile())) throw new Error('Initialized data store is missing a database');
  }
  const check_journals = () => {
    const melody = join(root, 'melody');
    if (path_exists(melody) && (lstatSync(melody).isSymbolicLink() || !lstatSync(melody).isDirectory())) {
      throw new Error('Melody data directory must not be a symlink');
    }
    for (const path of databases) {
      if (!path_exists(path)) continue;
      assert_regular(path);
      const db = new DatabaseSync(path, { readOnly: true });
      try {
        const row = db.prepare('PRAGMA journal_mode').get();
        const mode = row?.journal_mode;
        if (typeof mode !== 'string' || !['delete', 'truncate', 'persist'].includes(mode)) throw new Error(`Unsupported SQLite journal mode: ${String(mode)}`);
      } finally { db.close(); }
    }
  };
  check_journals();
  await new WebStorage(root).init();
  await new MelodyService(join(root, 'melody')).init();
  check_journals();
  const descriptor = openSync(marker, constants.O_CREAT | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try { if (!fstatSync(descriptor).isFile()) throw new Error('Initialization marker must be a regular file'); }
  finally { closeSync(descriptor); }
}

/** Holds the writer descriptor in both supervisor and single Node worker until that worker exits. */
export async function main(): Promise<void> {
  const directory = process.env.EARWYRM_DATA_DIR;
  if (!directory) throw new Error('EARWYRM_DATA_DIR must name the mounted volume');
  const descriptor = acquire_writer_lock(directory);
  try {
    await prepare_databases(directory, { database_url: database_url_from_environment(process.env) });
    const entrypoint = fileURLToPath(new URL('./web_app.js', import.meta.url));
    const child = spawn(process.execPath, [entrypoint], {
      env: { ...process.env, HOST: '0.0.0.0', PORT: '8080' },
      stdio: ['inherit', 'inherit', 'inherit', descriptor],
    });
    const forward_term = () => { child.kill('SIGTERM'); };
    const forward_int = () => { child.kill('SIGINT'); };
    process.on('SIGTERM', forward_term);
    process.on('SIGINT', forward_int);
    try {
      await new Promise<void>((complete, reject) => {
        child.once('error', reject);
        child.once('exit', (code, signal) => {
          if (code === 0) complete();
          else reject(new Error(`Web worker exited ${signal ? `on ${signal}` : `with status ${String(code)}`}`));
        });
      });
    } finally {
      process.off('SIGTERM', forward_term);
      process.off('SIGINT', forward_int);
    }
  } finally { closeSync(descriptor); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    console.error('Cloud web startup or worker failed; no successful delivery');
    process.exitCode = 1;
  });
}
