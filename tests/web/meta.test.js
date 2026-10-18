/**
 * C1 (streams/C.md): the shell document carries the default social tags,
 * and the public robots and sitemap name the pages L1 lists.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');
const DESCRIPTION = 'A map of the charted Traveller universe, with a private campaign on top of it.';

test('index.html carries the default description, social tags and theme colour', () => {
    const html = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8');
    const tokens = fs.readFileSync(path.join(webRoot, 'src', 'design', 'tokens.css'), 'utf8');
    const bg0 = tokens.match(/--bg-0:\s*(#[0-9a-fA-F]{6})/)?.[1];
    assert.ok(bg0, 'tokens.css defines --bg-0');
    assert.match(html, /theme-color is --bg-0/);
    assert.match(html, new RegExp(`<meta name="description" content="${DESCRIPTION}"`));
    assert.match(html, new RegExp(`<meta name="theme-color" content="${bg0}"`));
    assert.match(html, /<meta property="og:title" content="Traveller\.voyage"/);
    assert.match(html, new RegExp(`<meta property="og:description" content="${DESCRIPTION}"`));
    assert.match(html, /<meta property="og:type" content="website"/);
    assert.match(html, /<meta property="og:url" content="https:\/\/traveller\.voyage\/"/);
    assert.match(html, /<meta property="og:image" content="https:\/\/traveller\.voyage\/og\.png"/);
    assert.match(html, /<meta property="og:site_name" content="Traveller\.voyage"/);
    assert.match(html, /<meta name="twitter:card" content="summary_large_image"/);
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1\.0, viewport-fit=cover"/);
});

test('robots.txt allows the site and keeps private paths out', () => {
    const text = fs.readFileSync(path.join(webRoot, 'public', 'robots.txt'), 'utf8');
    assert.match(text, /^User-agent: \*$/m);
    assert.match(text, /^Allow: \/$/m);
    for (const rule of ['/api/', '/account', '/claim/', '/join/']) {
        assert.match(text, new RegExp(`^Disallow: ${rule}$`, 'm'));
    }
});

test('sitemap.xml lists the four public pages', () => {
    const text = fs.readFileSync(path.join(webRoot, 'public', 'sitemap.xml'), 'utf8');
    for (const loc of [
        'https://traveller.voyage/',
        'https://traveller.voyage/packages',
        'https://traveller.voyage/help',
        'https://traveller.voyage/welcome',
    ]) {
        assert.match(text, new RegExp(`<loc>${loc}</loc>`));
    }
});
