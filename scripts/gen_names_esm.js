import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let text = fs.readFileSync(path.join(ROOT, 'names.js'), 'utf8');
if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
const sb = { console };
sb.window = sb;
sb.self = sb;
sb.globalThis = sb;
vm.runInContext(text, vm.createContext(sb), { filename: 'names.js' });
const outDir = path.join(ROOT, 'packages', 'engines', 'src', 'generated');
fs.mkdirSync(outDir, { recursive: true });
const body = [
    '// GENERATED from names.js by scripts/gen_names_esm.js — do not edit.',
    `export const SYSTEM_NAMES = ${JSON.stringify(sb.SYSTEM_NAMES)};`
].join('\n');
fs.writeFileSync(path.join(outDir, 'names_data.js'), body + '\n');
console.log(`names_data.js: ${sb.SYSTEM_NAMES.length} names`);
