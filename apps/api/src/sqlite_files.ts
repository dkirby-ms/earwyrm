import { chmodSync, closeSync, constants, existsSync, lstatSync, openSync } from "node:fs";

/** Creates only an unmarked store's file; marked stores and symlink targets fail closed when unavailable. */
export function prepare_database_file(path: string, marker: string): void {
  const flags = constants.O_RDWR | constants.O_NOFOLLOW | (existsSync(marker) ? 0 : constants.O_CREAT);
  const descriptor = openSync(path, flags, 0o600);
  try {
    if (!lstatSync(path).isFile()) throw new Error("Persistent database file is unavailable");
    chmodSync(path, 0o600);
  } finally { closeSync(descriptor); }
}
