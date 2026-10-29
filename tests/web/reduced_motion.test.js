/**
 * CU21. Every transition and animation takes its time from a --t-* token (or the comms theme
 * alias, which the same switch zeros). prefers-reduced-motion sets those tokens to 0ms and
 * the one guard in design/base.css cuts anything left. A component does not invent a duration.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../apps/web/src');
const read = (file) => fs.readFileSync(path.join(src, file), 'utf8');

function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return /\.(vue|css)$/.test(entry.name) ? [full] : [];
    });
}

function styles(file, text) {
    if (file.endsWith('.css')) return text;
    return [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((match) => match[1]).join('\n');
}

function bare(value) {
    return value.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/cubic-bezier\([^)]*\)/g, ' ').replace(/steps\([^)]*\)/g, ' ');
}

test('reduced motion zeros every motion token and cuts what a token does not cover', () => {
    const tokens = read('design/tokens.css');
    const root = tokens.slice(0, tokens.indexOf('@media (prefers-reduced-motion: reduce)'));
    const guard = tokens.slice(tokens.indexOf('@media (prefers-reduced-motion: reduce)'));
    const names = [...root.matchAll(/(--(?:t|comms-theme)-[a-z0-9-]+):\s*-?\d+ms/g)].map((match) => match[1]);
    assert.ok(names.includes('--t-fast'));
    assert.ok(names.includes('--comms-theme-in'));
    for (const name of names) {
        assert.match(guard, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\s*0ms'), name);
    }
    const base = read('design/base.css');
    assert.match(base, /@media \(prefers-reduced-motion: reduce\) \{[^}]*animation-duration:\s*var\(--t-fast\) !important;[^}]*transition-duration:\s*var\(--t-fast\) !important;/s);
});

test('every transition and animation uses a motion token', () => {
    const decl = /(animation-duration|animation-delay|animation|transition-duration|transition-delay|transition)\s*:\s*([^;{}]+)/g;
    const time = /(?<![\w-])\d*\.?\d+m?s\b/;
    const variable = /var\(\s*(--[a-z0-9-]+)\s*\)/g;
    const allowed = (name) => name.startsWith('--t-') || name.startsWith('--ease-') || name === '--comms-theme-ms' || name === '--i';
    const bad = [];
    for (const file of walk(src)) {
        const css = styles(file, fs.readFileSync(file, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, ' ');
        for (const match of css.matchAll(decl)) {
            const value = bare(match[2]);
            const where = path.relative(src, file) + ': ' + match[1] + ': ' + match[2].trim();
            if (time.test(value)) bad.push(where);
            for (const used of value.matchAll(variable)) {
                if (!allowed(used[1])) bad.push(where + ' (' + used[1] + ')');
            }
        }
    }
    assert.deepEqual(bad, []);
});
