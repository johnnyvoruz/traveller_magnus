/**
 * The store scrolls (prompts/d_store_scroll.md). The app frame is fixed to the window
 * (App.vue), so html and body are 0 px tall and the document never scrolls: a page taller than
 * the window that does not scroll itself spills out of the frame and cannot be reached. The
 * store and the account page are each their own full-window scroller.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (rel) => readFileSync(new URL('../../apps/web/src/' + rel, import.meta.url), 'utf8');

/** The declarations of the first rule for `selector` in a file's style block. */
function rule(text, selector) {
    const style = text.slice(text.indexOf('<style'));
    const at = style.indexOf('\n' + selector + ' {');
    assert.ok(at >= 0, selector + ' has a rule');
    const body = style.slice(at, style.indexOf('}', at));
    return Object.fromEntries(body.split('\n').map((line) => line.trim().match(/^([a-z-]+):\s*(.+);$/)).filter(Boolean).map((m) => [m[1], m[2]]));
}

const SCROLLER = { position: 'absolute', inset: '0', 'overflow-y': 'auto' };

test('the app frame is fixed to the window, so a page must scroll itself', () => {
    const app = rule(read('App.vue'), '.app');
    assert.equal(app.position, 'fixed');
    assert.equal(app.inset, '0');
});

test('the store and the product page sit in one full-window scroller', () => {
    const text = read('workspace/market/PackagesView.vue');
    const template = text.slice(text.indexOf('\n<template>') + '\n<template>'.length).trimStart();
    assert.match(template, /^<div ref="scroller" class="mk-scroll"[^>]*>\s*<main class="mk-page"/);
    const scroll = rule(text, '.mk-scroll');
    for (const [key, value] of Object.entries(SCROLLER)) assert.equal(scroll[key], value, '.mk-scroll ' + key);
    // The column inside does not scroll or clip on its own.
    const page = rule(text, '.mk-page');
    assert.equal(page.overflow, undefined);
    assert.equal(page['overflow-y'], undefined);
    // A new path starts at the top: the router's own scroll moves the window, which never moves.
    assert.match(text, /if \(route\.path !== \(was \? was\.split\('\?'\)\[0\] : ''\)\) el\.scrollTop = 0;/);
    // Back and Forward (a history pop) return to the position saved for that entry (d_store_2 item 4c).
    assert.match(text, /router\.options\.history\.listen\(\(\) => \{ popped = true; \}\)/);
    assert.match(text, /@scroll\.passive="remember"/);
    assert.match(text, /if \(fromPop\) \{\s*restore\(saved\.get\(entryKey\(\)\) \?\? 0\);/);
});

test('the account page is its own full-window scroller', () => {
    const page = rule(read('workspace/passkey/AccountPage.vue'), '.pk-page');
    for (const [key, value] of Object.entries(SCROLLER)) assert.equal(page[key], value, '.pk-page ' + key);
});
