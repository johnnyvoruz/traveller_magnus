import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSchemas, schemas, schemasLoaded } from '../../apps/web/src/platform/schemas.ts';

// ZP2. The zod schemas load on demand (platform/schemas.ts). Nothing the first paint imports may pull
// the schema library in, or the split is undone without a sound.

const SRC = fileURLToPath(new URL('../../apps/web/src/', import.meta.url));

test('loadSchemas is idempotent and schemas() answers once loaded', async () => {
    const first = loadSchemas();
    assert.equal(loadSchemas(), first, 'one load, shared by every caller');
    const loaded = await first;
    assert.equal(schemasLoaded(), true);
    assert.equal(schemas(), loaded);
    assert.equal(typeof loaded.Universe.safeParse, 'function');
    assert.equal(typeof loaded.PlayersPage.safeParse, 'function');
    assert.equal(typeof loaded.publicFinishedLegs, 'function');
    assert.equal(loaded.Track.safeParse([]).success, true);
});

/** Value imports and re-exports of one file; `import type` is skipped. */
function valueImports(text) {
    const found = [];
    const re = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?([^;'"]*?)\s*from\s*'([^']+)'|(?:^|\n)\s*import\s+'([^']+)'/g;
    let m;
    while ((m = re.exec(text))) {
        if (m[1]) continue;
        found.push({ names: m[2] || '', spec: m[3] || m[4] });
    }
    return found;
}

function resolve(from, spec) {
    const base = path.resolve(path.dirname(from), spec);
    for (const c of [base, base + '.ts', base + '.vue', base + '/index.ts']) {
        if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    }
    return null;
}

function staticClosure(entry) {
    const seen = new Set();
    const bad = [];
    const walk = (file) => {
        if (seen.has(file)) return;
        seen.add(file);
        let text = fs.readFileSync(file, 'utf8');
        if (file.endsWith('.vue')) text = (text.match(/<script[^>]*>([\s\S]*?)<\/script>/g) || []).join('\n');
        for (const { names, spec } of valueImports(text)) {
            const where = path.relative(SRC, file).replaceAll('\\', '/');
            if (spec === 'zod' || spec.startsWith('zod/') || spec.includes('node_modules/zod')) bad.push(where + ' imports zod');
            else if (spec === '@voyage/shared') {
                const used = names.replace(/[{}]/g, '').split(',').map((s) => s.trim()).filter((s) => s && !s.startsWith('type '));
                if (used.length > 0) bad.push(where + ' imports ' + used.join(', ') + ' from @voyage/shared');
            } else if (spec.startsWith('.')) {
                const next = resolve(file, spec);
                if (next) walk(next);
                else if (!/\.(css|svg|png|json)(\?.*)?$/.test(spec)) bad.push(where + ' imports ' + spec + ', which is not a module here');
            }
        }
    };
    walk(entry);
    return { seen, bad };
}

test('the first paint (main.ts and everything it imports at once) imports no zod and no schema value', () => {
    const { seen, bad } = staticClosure(path.join(SRC, 'main.ts'));
    assert.ok(seen.size > 100, 'the walk reached the app: ' + seen.size);
    assert.deepEqual(bad, [], 'A first-paint module needs a schema through platform/schemas.ts, or a limit through a *_core subpath.');
});

test('the stores load the schemas before they parse, and the news values need none', () => {
    for (const file of ['campaign/store.ts', 'campaign/commit.ts', 'campaign/demo.ts', 'builder/draft.ts', 'builder/store.ts']) {
        assert.match(fs.readFileSync(path.join(SRC, file), 'utf8'), /loadSchemas\(\)/, file + ' starts the load');
    }
    const params = fs.readFileSync(path.join(SRC, 'news/params.ts'), 'utf8');
    assert.doesNotMatch(params, /^import .*zod/m, 'news/params.ts keeps the values; the schema is news/params_schema.ts');
});

test('a parse that follows its request never reads schemas() ahead of the await', () => {
    // `schemas().X.parse(await call())` reads schemas() before the await, in a browser, before the load is in.
    for (const file of ['campaign/store.ts', 'campaign/commit.ts', 'campaign/demo.ts', 'builder/draft.ts', 'builder/store.ts', 'builder/sectors.ts']) {
        const text = fs.readFileSync(path.join(SRC, file), 'utf8');
        assert.doesNotMatch(text, /schemas\(\)\.\w+\.(?:safeParse|parse)\(\s*await\b/, file);
    }
});