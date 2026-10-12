import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const trees = ['apps/web/src/dossier', 'apps/web/src/surface'];

function vueFiles(dir) {
    const found = [];
    for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) found.push(...vueFiles(full));
        else if (name.endsWith('.vue')) found.push(full);
    }
    return found;
}

/** Style blocks that are not scoped. Scoped CSS cannot collide across files. */
function unscopedCss(source) {
    const blocks = [];
    const pattern = /<style\b([^>]*)>([\s\S]*?)<\/style>/g;
    let match = pattern.exec(source);
    while (match) {
        if (!/\bscoped\b/.test(match[1])) blocks.push(match[2]);
        match = pattern.exec(source);
    }
    return blocks;
}

function splitSelectors(selector) {
    const parts = [];
    let depth = 0;
    let current = '';
    for (const ch of selector) {
        if (ch === '(') depth += 1;
        else if (ch === ')') depth -= 1;
        if (ch === ',' && depth === 0) {
            parts.push(current);
            current = '';
        } else current += ch;
    }
    if (current.trim()) parts.push(current);
    return parts;
}

/**
 * A class named by a top-level rule whose selector is that one compound
 * (a class, plus attributes or pseudos). A descendant or child rule is not
 * a second definition of the class.
 */
function loneClass(selector) {
    const text = selector.trim();
    if (!text || text.startsWith('@')) return null;
    if (/[\s>+~]/.test(text)) return null;
    const match = text.match(/^\.([A-Za-z_][\w-]*)/);
    return match ? match[1] : null;
}

function topLevelClasses(css) {
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const names = new Set();
    let depth = 0;
    let selector = '';
    let quote = '';
    for (let i = 0; i < stripped.length; i += 1) {
        const ch = stripped[i];
        if (quote) {
            if (ch === quote && stripped[i - 1] !== '\\') quote = '';
            if (depth === 0) selector += ch;
            continue;
        }
        if (ch === '"' || ch === "'") {
            quote = ch;
            if (depth === 0) selector += ch;
            continue;
        }
        if (ch === '{') {
            if (depth === 0) {
                for (const part of splitSelectors(selector)) {
                    const name = loneClass(part);
                    if (name) names.add(name);
                }
            }
            selector = '';
            depth += 1;
            continue;
        }
        if (ch === '}') {
            depth = Math.max(0, depth - 1);
            continue;
        }
        if (depth === 0) selector += ch;
    }
    return names;
}

test('an unscoped class rule in dossier or surface is defined in one file', () => {
    const owners = new Map();
    for (const tree of trees) {
        for (const file of vueFiles(path.join(root, tree))) {
            const rel = path.relative(root, file).replaceAll('\\', '/');
            for (const css of unscopedCss(readFileSync(file, 'utf8'))) {
                for (const name of topLevelClasses(css)) {
                    const list = owners.get(name) ?? [];
                    if (!list.includes(rel)) list.push(rel);
                    owners.set(name, list);
                }
            }
        }
    }
    const collisions = [...owners.entries()].filter(([, files]) => files.length > 1);
    assert.deepEqual(collisions, []);
});
