// npm run draft -- <version> [--subject "<commit subject>"] [--date YYYY-MM-DD] [--force]
// Drafts releases/<version>.json from the release commit's subject line. Edit the JSON before you render.
// Without --subject it reads `git log` (read-only) for a subject that starts with the version.
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './serve.js';
import { parseArgs } from './args.js';

const REPO = join(ROOT, '..');

// "1.1.15 marketplace: remove an import; one import per package" -> items, one per "; " part.
// A part that opens with a short lowercase "area:" label keeps it as the item's area.
function parseSubject(subject, version) {
  const body = subject.startsWith(version) ? subject.slice(version.length).trim() : subject.trim();
  return body
    .split(/;\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^([a-z][a-z0-9 ]{0,24}):\s+(.+)$/);
      const area = m ? m[1] : null;
      const text = m ? m[2] : part;
      return { area, text: text.charAt(0).toUpperCase() + text.slice(1) };
    });
}

function findCommit(version) {
  const log = execFileSync('git', ['log', '--format=%ad%x1f%s', '--date=short'], { cwd: REPO, encoding: 'utf8' });
  for (const line of log.split('\n')) {
    const [date, subject] = line.split('\x1f');
    if (subject && subject.startsWith(`${version} `)) return { date, subject };
  }
  return null;
}

const opts = parseArgs(process.argv.slice(2));
const out = join(ROOT, 'releases', `${opts.version}.json`);
if (existsSync(out) && !opts.force) {
  console.error(`releases/${opts.version}.json already exists. Pass --force to replace it.`);
  process.exit(1);
}
const found = opts.subject ? { subject: opts.subject, date: opts.date } : findCommit(opts.version);
if (!found) {
  console.error(`No commit subject starts with "${opts.version} ". Pass --subject "<text>" instead.`);
  process.exit(1);
}
const release = {
  version: opts.version,
  date: opts.date || found.date || new Date().toISOString().slice(0, 10),
  items: parseSubject(found.subject, opts.version),
};
writeFileSync(out, `${JSON.stringify(release, null, 2)}\n`);
console.log(`Wrote releases/${opts.version}.json with ${release.items.length} items. Edit it, then: npm run preview -- ${opts.version}`);
