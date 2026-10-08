import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.RULES_GEN_OUT
    ? path.resolve(process.env.RULES_GEN_OUT)
    : path.join(ROOT, 'packages', 'engines', 'src', 'generated', 'rules');
fs.mkdirSync(OUT, { recursive: true });

/** The character sheet is the one generated module TypeScript imports with no `@ts-expect-error`. */
function writeCharacterSheetDeclaration(sourceFile) {
    const decl = [
        `// GENERATED from rules/${sourceFile} by scripts/gen_rules_esm.js — do not edit; rules/ is the source.`,
        'export interface CharacterSheetField {',
        '    name: string;',
        '    page: number;',
        '    type: \'text\' | \'checkbox\';',
        '    box: { x: number; y: number; w: number; h: number };',
        '    section: string;',
        '}',
        'declare const sheet: {',
        '    source: string;',
        '    pageSize: { width: number; height: number };',
        '    box: string;',
        '    fields: CharacterSheetField[];',
        '};',
        'export default sheet;',
        '',
    ].join('\n');
    fs.writeFileSync(path.join(OUT, 'mgt2e_character_sheet_fields.d.ts'), decl);
}

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

for (const file of fs.readdirSync(path.join(ROOT, 'rules')).filter(f => f.endsWith('.json'))) {
    const parsed = JSON.parse(fs.readFileSync(path.join(ROOT, 'rules', file), 'utf8'));
    const out = file.replace(/\.json$/, '.js');
    const body = [
        `// GENERATED from rules/${file} by scripts/gen_rules_esm.js — do not edit; rules/ is the source.`,
        `export default ${JSON.stringify(parsed)};`,
    ].join('\n');
    fs.writeFileSync(path.join(OUT, out), body);
    // The ship-sheet import still carries @ts-expect-error. A declaration for it would
    // make that directive unused, and that file is not this generator's to change.
    if (out === 'mgt2e_character_sheet_fields.js') {
        if (!Array.isArray(parsed.fields)) throw new Error(`${file} has no fields array`);
        writeCharacterSheetDeclaration(file);
    }
    const entries = Array.isArray(parsed) ? parsed.length : (Array.isArray(parsed.fields) ? parsed.fields.length : 0);
    console.log(`${out}: default (${entries} entries)`);
}
