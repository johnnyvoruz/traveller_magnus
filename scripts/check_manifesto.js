import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIRS = ['apps/web/src', 'apps/api/src', 'packages/engines/src', 'packages/shared/src', 'packages/generation/src'].map(p => path.join(ROOT, p));
const allowPath = path.join(ROOT, 'scripts', 'check_allowlist.json');
const ALLOW = fs.existsSync(allowPath) ? JSON.parse(fs.readFileSync(allowPath, 'utf8')) : {};   // { "<rel file>": { "<pattern>": "<reason>" } }

const SCRIPT_PATTERNS = {
    'window.': /\bwindow\./, 'alert(': /\balert\(/, 'confirm(': /\bconfirm\(/, 'prompt(': /\bprompt\(/,
    'innerHTML': /\binnerHTML\b/, 'getElementById': /\bgetElementById\b/
};
const STYLE_PATTERNS = { 'hex colour': /#[0-9a-fA-F]{3,8}\b/, 'ms literal': /\b\d+ms\b/ };
// architecture.md §3 boundaries
const BOUNDARIES = [
    { from: /packages[\\/](engines|shared|generation)[\\/]/, mayNotImport: /(^|[\\/])apps[\\/]|@voyage\/(web|api)/ },
    { from: /packages[\\/]shared[\\/]/, mayNotImport: /^(?!zod$|\.{1,2}[\\/]|node:).*/ },
    { from: /apps[\\/]api[\\/]/, mayNotImport: /apps[\\/]web|@voyage\/web/ },
    { from: /apps[\\/]web[\\/]/, mayNotImport: /apps[\\/]api|@voyage\/(api|engines|generation)/ }   // the browser never imports engines
];

let failures = 0;
const fail = (rel, what) => { console.error(`${rel}: ${what}`); failures++; };
function check(rel, file, text) {
    const isVue = file.endsWith('.vue'), isCss = file.endsWith('.css');
    const styleText = isCss ? text : isVue ? (text.split(/<style[^>]*>/)[1] || '').split('</style>')[0] : '';
    const scriptText = isCss ? '' : isVue ? text.replace(/<style[\s\S]*?<\/style>/g, '') : text;
    for (const [name, re] of Object.entries(SCRIPT_PATTERNS)) if (re.test(scriptText) && !ALLOW[rel]?.[name]) fail(rel, name);
    if (!/tokens\.css$/.test(rel)) for (const [name, re] of Object.entries(STYLE_PATTERNS)) if (re.test(styleText) && !ALLOW[rel]?.[name]) fail(rel, name);
    for (const b of BOUNDARIES) if (b.from.test(file))
        for (const m of scriptText.matchAll(/from\s+['"]([^'"]+)['"]/g)) if (b.mayNotImport.test(m[1])) fail(rel, `forbidden import ${m[1]}`);
}
function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== 'generated') walk(file); continue; }
        if (!/\.(ts|js|mjs|vue|css)$/.test(e.name)) continue;
        check(path.relative(ROOT, file).replace(/\\/g, '/'), file, fs.readFileSync(file, 'utf8'));
    }
}
SRC_DIRS.forEach(walk);
if (failures) { console.error(`${failures} manifesto violation(s)`); process.exit(1); }
console.log('manifesto: clean');
