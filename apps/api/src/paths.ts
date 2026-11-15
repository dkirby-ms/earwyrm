import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Stable in both apps/api/src and apps/api/dist, independent of the working directory. */
export const REPOSITORY_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** Only the web workspace's production bundle may be served as static application content. */
export const STATIC_ROOT = resolve(REPOSITORY_ROOT, 'apps/web/dist');
