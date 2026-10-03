import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'packages', 'engines', 'src', 'generated', 'rules');
fs.mkdirSync(OUT, { recursive: true });

for (const file of fs.readdirSync(path.join(ROOT, 'rules')).filter(f => f.endsWith('.js'))) {
    const text = fs.readFileSync(path.join(ROOT, 'rules', file), 'utf8');
    const topConsts = [...text.matchAll(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
    // No `module` and no `define` in the sandbox: a UMD wrapper must take its browser branch (root.X = factory()).
    const sb = { console }; sb.window = sb; sb.self = sb; sb.globalThis = sb;
    vm.runInContext(`var __root = this;\n${text}\n${topConsts.map(n => `__root.${n} = ${n};`).join('\n')}`, vm.createContext(sb), { filename: file });
    const names = new Set(topConsts);
    for (const k of Object.keys(sb)) if (!['console', 'window', 'self', 'globalThis', '__root'].includes(k)) names.add(k);
    const body = [
        `// GENERATED from rules/${file} by scripts/gen_rules_esm.js — do not edit; rules/ is the source.`,
        '// An ES module has no `module` or `define` binding, so a UMD wrapper takes its browser branch here too.',
        'const __root = {}; const window = __root; const self = __root;',
        '(function () {', text, topConsts.map(n => `__root.${n} = ${n};`).join('\n'), '}).call(__root);',
        ...[...names].map(n => `export const ${n} = __root.${n};`),
        'export default __root;'
    ].join('\n');
    fs.writeFileSync(path.join(OUT, file), body);
    console.log(`${file}: ${[...names].join(', ')}`);
}
