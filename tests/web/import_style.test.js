/**
 * The store's styles load with the store (prompts/d_import_style.md). A component's unscoped
 * <style> loads only with that component, so a class the product page or its import panel
 * borrows from the publish forms or the Build pane has no style on a page opened cold. This reads
 * the sources (as store_scroll.test.js does): every class on an element in the store's own
 * components must be styled by a file that loads with the page, wherever any file styles it.
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../apps/web/src');
const rel = (path) => relative(SRC, path).split(sep).join('/');
const read = (path) => readFileSync(path, 'utf8');

/** Files reached by static imports (and CSS @import) from `start`; `import()` is left out. */
function staticClosure(starts) {
    const seen = new Set();
    const follow = (path) => {
        if (seen.has(path) || !existsSync(path)) return;
        seen.add(path);
        for (const m of read(path).matchAll(/^\s*@?import\s+(?:[^'"]*?from\s+)?['"]((?:\.|\/src\/)[^'"]+)['"]/gm)) {
            let next = m[1].startsWith('/src/') ? join(SRC, m[1].slice('/src/'.length)) : resolve(dirname(path), m[1]);
            if (!existsSync(next)) next = ['.ts', '.js'].map((ext) => next + ext).find(existsSync) ?? next;
            follow(next);
        }
    };
    for (const start of starts) follow(join(SRC, start));
    return seen;
}

/** Every .vue and .css file under src. */
function allStyleFiles() {
    const out = [];
    const walk = (dir) => {
        for (const name of readdirSync(dir)) {
            const path = join(dir, name);
            if (statSync(path).isDirectory()) walk(path);
            else if (/\.(vue|css)$/.test(name)) out.push(path);
        }
    };
    walk(SRC);
    return out;
}

/** A selector as compounds from outermost to the subject: { tag, classes }. */
function compounds(selector) {
    return selector
        .replace(/:not\([^)]*\)/g, '')
        .replace(/::?[\w-]+(\([^)]*\))?/g, '')
        .replace(/\[[^\]]*\]/g, '')
        .replace(/\s*[>+~]\s*/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => ({ tag: (part.match(/^[a-zA-Z][\w-]*/) || [''])[0], classes: [...part.matchAll(/\.([\w-]+)/g)].map((m) => m[1]) }));
}

/** Every rule's selectors in a file's style, as compound lists. */
function selectorsOf(path) {
    const text = read(path);
    const style = path.endsWith('.css') ? text : [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
    const out = [];
    for (const m of style.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{[^{}]*\}/g)) {
        for (const selector of m[1].split(',')) if (selector.includes('.')) out.push(compounds(selector));
    }
    return out;
}

const VOID = new Set(['input', 'img', 'br', 'hr', 'source', 'col', 'area', 'wbr', 'meta', 'link']);

/** The template's elements with their classes and ancestors; `context` is the ancestors outside the file. */
function elements(text, context) {
    const template = text.slice(text.indexOf('<template>') + '<template>'.length, text.lastIndexOf('</template>')).replace(/<!--[\s\S]*?-->/g, '');
    const stack = [...context];
    const out = [];
    for (const m of template.matchAll(/<(\/?)([A-Za-z][\w.-]*)((?:\s+[^\s=>/"']+(?:="[^"]*")?)*)\s*(\/?)>/g)) {
        const [, closing, tag, attrs, selfClosing] = m;
        if (closing) { stack.pop(); continue; }
        const classes = new Set();
        for (const c of attrs.matchAll(/(?:^|\s)class="([^"]*)"/g)) for (const name of c[1].split(/\s+/).filter(Boolean)) classes.add(name);
        for (const c of attrs.matchAll(/:class="([^"]*)"/g)) for (const name of c[1].matchAll(/'([\w-]+)'/g)) classes.add(name[1]);
        const el = { tag, classes, ancestors: [...stack], at: text.slice(0, text.indexOf(m[0])).split('\n').length };
        out.push(el);
        if (!selfClosing && !VOID.has(tag.toLowerCase())) stack.push(el);
    }
    return out;
}

const fits = (compound, el) => compound.classes.every((c) => el.classes.has(c)) && (!compound.tag || compound.tag === '*' || compound.tag === el.tag);

/** Does `selector` style class `name` on `el`: a compound holding it fits `el` and every compound before fits an ancestor. */
function styles(selector, name, el) {
    return selector.some((compound, i) => compound.classes.includes(name) && fits(compound, el) && selector.slice(0, i).every((outer) => el.ancestors.some((a) => fits(outer, a))));
}

const STORE = 'workspace/market/PackagesView.vue';
const loaded = staticClosure(['main.ts', STORE]);
const rules = allStyleFiles().map((path) => ({ file: rel(path), loaded: loaded.has(path), selectors: selectorsOf(path) }));
/** The store's own components: the static closure of the store under market/. */
const storeFiles = [...staticClosure([STORE])].filter((path) => path.endsWith('.vue') && rel(path).startsWith('workspace/market/'));

/** Where a component sits: the ancestors of its tag in the store file that uses it, and theirs. */
function contextOf(path, seen = new Set()) {
    if (rel(path) === STORE || seen.has(path)) return [];
    seen.add(path);
    const name = path.split(sep).pop().replace(/\.vue$/, '');
    for (const parent of storeFiles) {
        if (parent === path) continue;
        const el = elements(read(parent), contextOf(parent, seen)).find((item) => item.tag === name);
        if (el) return el.ancestors;
    }
    return [];
}

/** Every class on an element in `path` that only a file loaded elsewhere styles. */
function unstyled(path) {
    const out = [];
    for (const el of elements(read(path), contextOf(path))) {
        for (const name of el.classes) {
            const by = rules.filter((r) => r.selectors.some((s) => styles(s, name, el)));
            if (by.length && !by.some((r) => r.loaded)) out.push(`${rel(path)}:${el.at} .${name} (only in ${by.map((r) => r.file).join(', ')})`);
        }
    }
    return out;
}

test('the store loads the files these checks rely on, and not the publish forms or the Build pane', () => {
    const names = [...loaded].map(rel);
    for (const file of ['design/base.css', 'workspace/market/market.css', 'workspace/market/ProductPage.vue', 'workspace/market/ImportPanel.vue']) assert.ok(names.includes(file), file);
    for (const file of ['workspace/market/PublishFields.vue', 'workspace/market/PublishForm.vue', 'workspace/market/RecordsPublish.vue', 'workspace/build/BuildPane.vue', 'workspace/build/GenerateSheet.vue']) assert.ok(!names.includes(file), file);
});

test('the matcher sees a class borrowed from a lazily loaded file', () => {
    const el = { tag: 'p', classes: new Set(['mk-sum']), ancestors: [] };
    const by = rules.filter((r) => r.selectors.some((s) => styles(s, 'mk-sum', el)));
    assert.deepEqual(by.map((r) => r.file), ['workspace/market/market.css']);
    // A rule kept to another box does not style the class outside it.
    assert.equal(styles(compounds('.mk-buy .mk-fine'), 'mk-fine', { tag: 'p', classes: new Set(['mk-fine']), ancestors: [{ tag: 'section', classes: new Set(['mk-imp']) }] }), false);
});

test('the import panel and the product page are styled by files that load with the page', () => {
    for (const file of ['ImportPanel.vue', 'ProductPage.vue']) assert.ok(storeFiles.some((path) => rel(path) === 'workspace/market/' + file), file);
    assert.deepEqual(storeFiles.flatMap(unstyled), []);
});

test('the shared lines have one definition, loaded by the store and by the publish forms', () => {
    const css = read(join(SRC, 'workspace/market/market.css'));
    for (const name of ['mk-sum', 'mk-fine']) {
        assert.match(css, new RegExp('\\n\\.' + name + ' \\{'));
        const homes = rules.filter((r) => r.selectors.some((s) => s.length === 1 && s[0].classes.length === 1 && s[0].classes[0] === name && !s[0].tag));
        assert.deepEqual(homes.map((r) => r.file), ['workspace/market/market.css'], name);
    }
    assert.match(read(join(SRC, 'workspace/market/PublishFields.vue')), /\nimport '\.\/market\.css';/);
    assert.match(read(join(SRC, STORE)), /\nimport '\.\/market\.css';/);
});
