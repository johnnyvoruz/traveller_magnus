// Shared argument parsing: the first bare argument is the version, the rest are --name value pairs.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './serve.js';

export const SIZES = { square: '1080x1080', wide: '1920x1080', tall: '1080x1920' };

export function parseArgs(argv) {
  const opts = { version: null, size: SIZES.square, fps: 30, out: null, still: null, subject: null, date: null, force: false, silent: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--force') opts.force = true;
    else if (arg === '--silent') opts.silent = true;
    else if (arg.startsWith('--')) opts[arg.slice(2)] = argv[++i];
    else if (!opts.version) opts.version = arg;
  }
  opts.size = SIZES[opts.size] || opts.size;
  if (!/^\d+x\d+$/.test(opts.size)) throw new Error(`--size must be square, wide, tall or WIDTHxHEIGHT, not ${opts.size}`);
  // H.264 in yuv420p, the format X and most players take, needs an even width and height.
  if (opts.still === null && opts.size.split('x').some((n) => Number(n) % 2)) {
    throw new Error(`--size ${opts.size}: width and height must be even for video. A stand-in like 1080x1080 scales down cleanly.`);
  }
  opts.fps = Number(opts.fps);
  if (!opts.version) {
    console.error('Name a version, for example: npm run render -- 1.1.15');
    process.exit(1);
  }
  return opts;
}

export function requireRelease(version) {
  const file = join(ROOT, 'releases', `${version}.json`);
  if (!existsSync(file)) {
    console.error(`No releases/${version}.json. Run: npm run draft -- ${version}`);
    process.exit(1);
  }
  return file;
}
