// npm run preview -- <version> [--size 1080x1080]
// Serves the scene with play, pause and a scrub bar. Edit scene/ or releases/ and reload the page.
import { serve } from './serve.js';
import { parseArgs, requireRelease } from './args.js';

const { version, size } = parseArgs(process.argv.slice(2));
requireRelease(version);
const { origin } = await serve(4317);
console.log(`Preview: ${origin}/scene/index.html?release=${version}&size=${size}&preview`);
console.log('Press Ctrl+C to stop.');
