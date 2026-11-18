import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync,
} from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MelodyService } from './melody_service.js';
import { WebStorage } from './web_storage.js';
import { upgrade_postgres_store } from './bootstrap_database.js';
import { database_url_from_environment, StoreNotInitialized, validate_postgres_store } from './persistence.js';

const STARTUP_ERROR_CODES = new Set([
  'EARWYRM_DATA_NOT_MOUNTED',
  'EACCES', 'EPERM', 'ENOENT', 'ENOTDIR', 'ELOOP', 'ENOSPC', 'EIO', 'EROFS',
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH',
  '28P01', '28000', '3D000', '42501', '42P01', '53300', '57P03',
  'CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID', 'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'ERR_TLS_CERT_ALTNAME_INVALID',
]);
const STARTUP_ERROR_REASONS = new Set([
  'EARWYRM_DATA_DIR must name the mounted volume',
  'EARWYRM_DATA_DIR must be an absolute mount path',
  'Data directory must be a real mount directory',
  'Writer lock must be a regular unlinked-from-elsewhere file',
  'The util-linux flock command is required',
  'Data directory already has an active writer',
  'Writer lock changed while acquiring the lock',
]);

// Only fixed messages and recognized codes may reach logs; driver errors can contain credentials.
function startup_error_detail(error: unknown): string {
  if (error instanceof StoreNotInitialized) return 'PostgreSQL store is not initialized or is incomplete';
  if (!(error instanceof Error)) return 'unrecognized failure; raw error withheld';
  const details: string[] = [];
  if ('code' in error && typeof error.code === 'string' && STARTUP_ERROR_CODES.has(error.code)) details.push(`code=${error.code}`);
  if (STARTUP_ERROR_REASONS.has(error.message)) details.push(error.message);
  if (error.cause instanceof Error && 'code' in error.cause && typeof error.cause.code === 'string' && STARTUP_ERROR_CODES.has(error.cause.code)) {
    details.push(`cause_code=${error.cause.code}`);
  }
  return details.length ? details.join('; ') : 'unrecognized failure; raw error withheld';
}

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
  if (!(options.is_mounted ?? _is_mounted)(data_dir)) {
    throw Object.assign(new Error(`Data directory is not a mounted volume: ${data_dir}`), { code: 'EARWYRM_DATA_NOT_MOUNTED' });
  }
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

/** Prepares SQLite or verifies PostgreSQL; an optional additive upgrade requires the caller to hold the writer lock. */
export async function prepare_databases(data_dir: string, { database_url = null, upgrade_postgres = false }: {
  database_url?: string | null; upgrade_postgres?: boolean;
} = {}): Promise<void> {
  if (database_url !== null) {
    if (upgrade_postgres) await upgrade_postgres_store(database_url);
    else await validate_postgres_store(database_url);
    return;
  }
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

/** Holds the writer descriptor until the worker exits; logs a secret-safe stage diagnostic before rejecting. */
export async function main(): Promise<void> {
  let stage = 'configuration';
  try {
    const directory = process.env.EARWYRM_DATA_DIR;
    if (!directory) throw new Error('EARWYRM_DATA_DIR must name the mounted volume');
    stage = 'writer-lock';
    const descriptor = acquire_writer_lock(directory);
    try {
      stage = 'database-configuration';
      const database_url = database_url_from_environment(process.env);
      stage = 'database-preparation';
      await prepare_databases(directory, {
        database_url, upgrade_postgres: (process.env.LYRIC_ENABLED ?? 'false').trim().toLowerCase() === 'true',
      });
      stage = 'worker';
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
            else {
              console.error(`Cloud web worker exited: status=${String(code)}; signal=${signal ?? 'none'}`);
              reject(new Error(`Web worker exited ${signal ? `on ${signal}` : `with status ${String(code)}`}`));
            }
          });
        });
      } finally {
        process.off('SIGTERM', forward_term);
        process.off('SIGINT', forward_int);
      }
    } finally { closeSync(descriptor); }
  } catch (error) {
    console.error(`Cloud web startup or worker failed; stage=${stage}; ${startup_error_detail(error)}; no successful delivery`);
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    process.exitCode = 1;
  });
}
