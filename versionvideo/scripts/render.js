// npm run render -- <version> [--size square|wide|tall|WxH] [--fps 30] [--out file.mp4] [--still <seconds>]
// Opens the scene in headless Edge (or $BROWSER), seeks the paused GSAP timeline to each frame,
// screenshots it and pipes the frames to ffmpeg. --still writes one PNG at that time instead.
// Music comes from scene/tune.js: looped when the video is longer than the track, faded out at the end.
// --silent leaves it off for one render.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import puppeteer from 'puppeteer-core';
import { serve, ROOT } from './serve.js';
import { parseArgs, requireRelease } from './args.js';
import { TUNE } from '../scene/tune.js';

const BROWSERS = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/microsoft-edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

function musicFile(opts) {
  if (opts.silent || !TUNE.music.file) return null;
  const file = join(ROOT, TUNE.music.file);
  if (!existsSync(file)) {
    console.error(`Music not found: ${TUNE.music.file} (set music.file in scene/tune.js, or pass --silent)`);
    process.exit(1);
  }
  return file;
}

function ffmpegArgs(out, length, opts) {
  const video = ['-f', 'image2pipe', '-framerate', String(opts.fps), '-i', '-'];
  const encode = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p'];
  const music = musicFile(opts);
  if (!music) return ['-y', '-loglevel', 'error', ...video, ...encode, '-movflags', '+faststart', out];
  const { volume, fadeIn, fadeOut } = TUNE.music;
  const filters = [`volume=${volume}`];
  if (fadeIn > 0) filters.push(`afade=t=in:st=0:d=${fadeIn}`);
  if (fadeOut > 0) filters.push(`afade=t=out:st=${Math.max(0, length - fadeOut).toFixed(3)}:d=${fadeOut}`);
  return [
    '-y', '-loglevel', 'error', ...video,
    '-stream_loop', '-1', '-i', music, // loop the track for as long as the video needs
    '-map', '0:v', '-map', '1:a', ...encode,
    '-af', filters.join(','), '-c:a', 'aac', '-b:a', '256k',
    '-t', length.toFixed(3), '-movflags', '+faststart', out,
  ];
}

const opts = parseArgs(process.argv.slice(2));
requireRelease(opts.version);
const [width, height] = opts.size.split('x').map(Number);
const executablePath = BROWSERS.find((p) => existsSync(p));
if (!executablePath) {
  console.error('No Edge or Chrome found. Set BROWSER to the browser executable.');
  process.exit(1);
}

const { server, origin } = await serve();
const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  page.on('pageerror', (err) => console.error('scene error:', err.message));
  await page.goto(`${origin}/scene/index.html?release=${opts.version}&size=${opts.size}&fps=${opts.fps}`, { waitUntil: 'load' });
  const { duration } = await page.evaluate(() => window.__jig.ready);

  if (opts.still !== null) {
    const out = opts.out || join(ROOT, 'out', `traveller-voyage-${opts.version}-${opts.size}-t${opts.still}.png`);
    mkdirSync(dirname(out), { recursive: true });
    await page.evaluate((t) => window.__jig.seek(t), Number(opts.still));
    writeFileSync(out, await page.screenshot({ type: 'png' }));
    console.log(`Wrote ${out}`);
  } else {
    const out = opts.out || join(ROOT, 'out', `traveller-voyage-${opts.version}-${opts.size}.mp4`);
    mkdirSync(dirname(out), { recursive: true });
    const frames = Math.ceil(duration * opts.fps);
    const length = frames / opts.fps;
    const ffmpeg = spawn('ffmpeg', ffmpegArgs(out, length, opts), { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((resolve, reject) => {
      ffmpeg.on('error', (err) => reject(new Error(`ffmpeg did not start (${err.message}). Is it on PATH?`)));
      ffmpeg.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))));
    });
    const started = Date.now();
    for (let f = 0; f < frames; f++) {
      await page.evaluate((t) => window.__jig.seek(t), f / opts.fps);
      const png = await page.screenshot({ type: 'png', optimizeForSpeed: true });
      if (!ffmpeg.stdin.write(png)) await new Promise((r) => ffmpeg.stdin.once('drain', r));
      if (f % opts.fps === 0) process.stdout.write(`\rframe ${f + 1}/${frames}`);
    }
    ffmpeg.stdin.end();
    await done;
    console.log(`\rWrote ${out} (${frames} frames, ${duration.toFixed(1)} s) in ${((Date.now() - started) / 1000).toFixed(0)} s`);
  }
} finally {
  await browser.close();
  server.close();
}
