// CC1: the bars receiver. The scheduler is Z's. This checks the instrument and the word timing.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mock, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { TIMING } from '../../apps/web/src/living/comms/controller.ts';
import { mountCommsReceiver, wordDuration, wordLetters } from '../../apps/web/src/living/comms/receiver_render.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vue = fs.readFileSync(path.join(root, 'apps/web/src/living/CommsReceiver.vue'), 'utf8');
const render = fs.readFileSync(path.join(root, 'apps/web/src/living/comms/receiver_render.ts'), 'utf8');
const orbit = fs.readFileSync(path.join(root, 'apps/web/src/views/OrbitView.vue'), 'utf8');

test('a word stays between the short and long limits', () => {
    assert.equal(wordLetters('pad-3'), 'pad3');
    assert.equal(wordDuration('Hold', 0.5), 187);
    assert.equal(wordDuration('a', 0), 160);
    assert.ok(wordDuration('supercalifragilistic', 1) <= 415);
});

test('the instrument is bars only, one line, and it does not ship the preview', () => {
    assert.match(vue, /role="region"/);
    assert.match(vue, /aria-live="polite"/);
    assert.match(vue, /data-waveform="bars"/);
    assert.match(vue, /Awaiting transmission/);
    assert.match(vue, /SYSTEM COMMS/);
    assert.match(vue, /aria-label="System communications"/);
    assert.doesNotMatch(vue, /LOCAL COMMS/);
    assert.match(vue, /data-trx-sig/);
    assert.match(vue, /data-signal="0"/);
    assert.equal((vue.match(/<button/g) || []).length, 0);
    assert.doesNotMatch(vue, /skip/i);
    assert.doesNotMatch(render, /runDemo/);
    assert.doesNotMatch(render, /Beowulf/);
    assert.doesNotMatch(render, /window\./);
    assert.match(render, /onTranscriptComplete/);
    assert.match(render, /function transmit/);
    assert.match(render, /function idle/);
    assert.match(render, /function destroy/);
});

test('the orbit view mounts it above the planet tabs while System Comms is on', () => {
    assert.match(orbit, /CommsReceiver/);
    assert.match(orbit, /deviceComms\.shown/);
    assert.match(orbit, /systemFacts/);
    assert.match(orbit, /class="orbit-comms"/);
    assert.match(orbit, /v-if="commsHeld"/);
    assert.doesNotMatch(orbit, /v-if="commsOpen"/);
    assert.match(orbit, /:shown="commsOn && !commsLeaving"/);
    assert.match(orbit, /transition: opacity var\(--t-base\) var\(--ease-out\)/);
    assert.match(orbit, /prefers-reduced-motion: reduce\) \{\s*\.orbit-comms \{\s*transition-duration: var\(--t-fast\)/);
    assert.match(orbit, /campaign\.universeId \|\| 'none'/);
    assert.doesNotMatch(render, /document\.createElement/);
    assert.match(render, /delay\(/);
    assert.match(vue, /createCommsController/);
    const foot = orbit.indexOf('class="orbit-foot"');
    const chips = orbit.indexOf('class="orbit-stage-chips"');
    assert.ok(foot > 0 && foot < chips);
});

const SVG = new Set(['svg', 'path', 'g', 'circle', 'lineargradient', 'stop', 'defs', 'rect', 'line']);

function installDom() {
    if (globalThis.document && globalThis.document.__commsDom) return;
    const HTML_NS = 'http://www.w3.org/1999/xhtml';
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const listeners = new Map();

    class NodeImpl {
        constructor(type) {
            this.nodeType = type;
            this.parentNode = null;
            this.childNodes = [];
            this.nodeValue = '';
        }
        get nextSibling() {
            if (!this.parentNode) return null;
            const i = this.parentNode.childNodes.indexOf(this);
            return this.parentNode.childNodes[i + 1] || null;
        }
        get previousSibling() {
            if (!this.parentNode) return null;
            const i = this.parentNode.childNodes.indexOf(this);
            return i > 0 ? this.parentNode.childNodes[i - 1] : null;
        }
        get firstChild() { return this.childNodes[0] || null; }
        get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
        insertBefore(node, anchor) {
            if (node && node.nodeType === 11) {
                for (const child of node.childNodes.slice()) this.insertBefore(child, anchor);
                return node;
            }
            if (node.parentNode) node.parentNode.removeChild(node);
            node.parentNode = this;
            const at = anchor ? this.childNodes.indexOf(anchor) : -1;
            if (at < 0) this.childNodes.push(node);
            else this.childNodes.splice(at, 0, node);
            return node;
        }
        appendChild(node) { return this.insertBefore(node, null); }
        remove() { if (this.parentNode) this.parentNode.removeChild(this); }
        removeChild(node) {
            const i = this.childNodes.indexOf(node);
            if (i >= 0) this.childNodes.splice(i, 1);
            node.parentNode = null;
            return node;
        }
        append(...nodes) {
            for (const node of nodes) this.appendChild(typeof node === 'string' ? document.createTextNode(node) : node);
        }
        replaceChildren(...nodes) {
            for (const child of this.childNodes.slice()) this.removeChild(child);
            this.append(...nodes);
        }
        get textContent() {
            if (this.nodeType === 3 || this.nodeType === 8) return this.nodeValue;
            return this.childNodes.map((child) => child.textContent).join('');
        }
        set textContent(value) {
            if (this.nodeType === 3 || this.nodeType === 8) {
                this.nodeValue = value == null ? '' : String(value);
                return;
            }
            for (const child of this.childNodes.slice()) this.removeChild(child);
            if (value != null && value !== '') this.appendChild(document.createTextNode(String(value)));
        }
        cloneNode(deep) {
            if (this.nodeType === 3) return document.createTextNode(this.nodeValue);
            if (this.nodeType === 8) return document.createComment(this.nodeValue);
            if (this.nodeType === 11) {
                const copy = document.createDocumentFragment();
                if (deep) for (const child of this.childNodes) copy.appendChild(child.cloneNode(true));
                return copy;
            }
            const copy = this.namespaceURI === SVG_NS ? document.createElementNS(SVG_NS, this.localName) : document.createElement(this.localName);
            for (const [key, val] of Object.entries(this.attributes)) copy.setAttribute(key, val);
            if (deep) for (const child of this.childNodes) copy.appendChild(child.cloneNode(true));
            return copy;
        }
        addEventListener(type, fn) {
            const list = listeners.get(this) || [];
            list.push([type, fn]);
            listeners.set(this, list);
        }
        removeEventListener(type, fn) {
            const list = listeners.get(this) || [];
            listeners.set(this, list.filter((pair) => pair[0] !== type || pair[1] !== fn));
        }
    }

    class Element extends NodeImpl {
        constructor(tag, ns) {
            super(1);
            this.localName = String(tag).toLowerCase();
            this.tagName = this.localName.toUpperCase();
            this.namespaceURI = ns || HTML_NS;
            this.attributes = Object.create(null);
            this.style = { setProperty: (name, value) => { this.style[name] = value; } };
            this._dataset = new Proxy({}, {
                get: (_target, key) => {
                    if (typeof key !== 'string') return undefined;
                    const attr = 'data-' + key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
                    return this.getAttribute(attr);
                },
                set: (_target, key, value) => {
                    const attr = 'data-' + String(key).replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
                    this.setAttribute(attr, value == null ? '' : String(value));
                    return true;
                },
            });
        }
        get dataset() { return this._dataset; }
        get className() { return this.getAttribute('class') || ''; }
        set className(value) { this.setAttribute('class', value == null ? '' : String(value)); }
        setAttribute(name, value) { this.attributes[name] = String(value); }
        getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null; }
        removeAttribute(name) { delete this.attributes[name]; }
        setAttributeNS(_ns, name, value) { this.setAttribute(name, value); }
        removeAttributeNS(_ns, name) { this.removeAttribute(name); }
        querySelector(selector) { return walk(this, selector); }
        querySelectorAll(selector) {
            const found = [];
            collect(this, selector, found);
            return found;
        }
        get innerHTML() { return ''; }
        set innerHTML(value) {
            for (const child of this.childNodes.slice()) this.removeChild(child);
            parseInto(this, String(value));
        }
    }

    class HTMLElement extends Element {}
    class SVGElement extends Element {}
    class DocumentFragment extends NodeImpl {
        constructor() { super(11); }
    }
    class TemplateElement extends HTMLElement {
        constructor() {
            super('template');
            this.content = new DocumentFragment();
        }
        set innerHTML(value) {
            this.content = new DocumentFragment();
            parseInto(this.content, String(value));
        }
    }

    function matches(el, selector) {
        const sel = selector.trim();
        if (sel.startsWith('[') && sel.endsWith(']')) {
            const body = sel.slice(1, -1);
            const eq = body.indexOf('=');
            if (eq < 0) return el.getAttribute(body) != null;
            let value = body.slice(eq + 1).trim();
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
            return el.getAttribute(body.slice(0, eq).trim()) === value;
        }
        if (sel.startsWith('.')) return el.className.split(/\s+/).includes(sel.slice(1));
        return el.localName === sel.toLowerCase();
    }
    function walk(el, selector) {
        for (const child of el.childNodes) {
            if (child.nodeType !== 1) continue;
            if (matches(child, selector)) return child;
            const found = walk(child, selector);
            if (found) return found;
        }
        return null;
    }
    function collect(el, selector, found) {
        for (const child of el.childNodes) {
            if (child.nodeType !== 1) continue;
            if (matches(child, selector)) found.push(child);
            collect(child, selector, found);
        }
    }
    function decode(text) {
        return text.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    }
    function parseAttrs(el, raw) {
        const re = /([:@A-Za-z_][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
        let match;
        while ((match = re.exec(raw))) {
            const value = match[2] ?? match[3] ?? match[4] ?? '';
            el.setAttribute(match[1], decode(value));
        }
    }
    function parseInto(parent, html) {
        const re = /<!--([\s\S]*?)-->|<\/([A-Za-z][\w:-]*)>|<([A-Za-z][\w:-]*)([^>]*?)(\/?)>/g;
        const stack = [parent];
        let last = 0;
        let match;
        while ((match = re.exec(html))) {
            const text = html.slice(last, match.index);
            if (text) stack[stack.length - 1].appendChild(document.createTextNode(decode(text)));
            last = re.lastIndex;
            if (match[0].startsWith('<!--')) {
                stack[stack.length - 1].appendChild(document.createComment(match[1]));
                continue;
            }
            if (match[2]) {
                const name = match[2].toLowerCase();
                for (let i = stack.length - 1; i > 0; i -= 1) {
                    if (stack[i].localName === name) {
                        stack.length = i;
                        break;
                    }
                }
                continue;
            }
            const tag = match[3];
            const parentNs = stack[stack.length - 1].namespaceURI;
            const svg = parentNs === SVG_NS || SVG.has(tag.toLowerCase());
            const el = svg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
            parseAttrs(el, match[4] || '');
            stack[stack.length - 1].appendChild(el);
            if (match[5] !== '/') stack.push(el);
        }
        const tail = html.slice(last);
        if (tail) stack[stack.length - 1].appendChild(document.createTextNode(decode(tail)));
    }

    const store = new Map();
    const document = {
        __commsDom: true,
        nodeType: 9,
        visibilityState: 'visible',
        hidden: false,
        documentElement: null,
        body: null,
        createElement: (tag) => tag === 'template' ? new TemplateElement() : new HTMLElement(tag),
        createElementNS: (_ns, tag) => new SVGElement(tag, SVG_NS),
        createTextNode: (text) => {
            const node = new NodeImpl(3);
            node.nodeValue = text == null ? '' : String(text);
            return node;
        },
        createComment: (text) => {
            const node = new NodeImpl(8);
            node.nodeValue = text == null ? '' : String(text);
            return node;
        },
        createDocumentFragment: () => new DocumentFragment(),
        querySelector: (selector) => document.documentElement ? walk(document.documentElement, selector) : null,
        addEventListener: (type, fn) => document.documentElement && document.documentElement.addEventListener(type, fn),
        removeEventListener: (type, fn) => document.documentElement && document.documentElement.removeEventListener(type, fn),
    };
    document.documentElement = new HTMLElement('html');
    document.body = new HTMLElement('body');
    document.documentElement.appendChild(document.body);
    globalThis.Element = Element;
    globalThis.HTMLElement = HTMLElement;
    globalThis.SVGElement = SVGElement;
    globalThis.Node = NodeImpl;
    globalThis.DocumentFragment = DocumentFragment;
    globalThis.document = document;
    globalThis.window = globalThis;
    globalThis.localStorage = {
        getItem: (key) => store.has(key) ? store.get(key) : null,
        setItem: (key, value) => { store.set(key, String(value)); },
        removeItem: (key) => { store.delete(key); },
    };
    globalThis.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    let raf = 0;
    globalThis.requestAnimationFrame = () => { raf += 1; return raf; };
    globalThis.cancelAnimationFrame = () => {};
    if (typeof globalThis.performance === 'undefined') globalThis.performance = { now: () => Date.now() };
}

const facts = {
    hexKey: 'Spinward_Marches/1910', name: 'Regina', sector: 'Spinward Marches', subsector: 'Regina',
    size: 7, atm: 8, hydro: 8, pop: 8, gov: 9, law: 9, tl: 12,
    tradeCodes: ['Ri'], zone: '', bases: 'NS', highport: true, starport: 'A',
    gasGiants: 3, belts: 1, moons: 0, otherBodies: 0, xboat: false,
    party: 'docked', day: 47, bodies: {},
};

test('a mounted receiver completes one transmission from a facts fixture', { timeout: 60000 }, async () => {
    installDom();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c-comms-'));
    const { createServer } = await import('vite');
    const server = await createServer({
        root: path.join(root, 'apps/web'),
        cacheDir,
        server: { middlewareMode: true, hmr: false, ws: false },
        appType: 'custom',
        logLevel: 'silent',
        plugins: [{
            name: 'vue-bridge',
            resolveId(id) {
                if (id === 'virtual:vue') return '\0virtual:vue';
            },
            load(id) {
                if (id === '\0virtual:vue') return 'export * from "vue";\n';
            },
        }],
    });
    let app = null;
    try {
        const vueRuntime = await server.ssrLoadModule('virtual:vue');
        const { parse, compileScript, compileTemplate } = await import('@vue/compiler-sfc');
        const view = (await server.ssrLoadModule('/src/living/CommsReceiver.vue')).default;
        const parsed = parse(vue, { filename: 'CommsReceiver.vue' });
        const script = compileScript(parsed.descriptor, { id: 'cc1b' });
        const compiled = compileTemplate({
            source: parsed.descriptor.template.content,
            filename: 'CommsReceiver.vue',
            id: 'cc1b',
            compilerOptions: { bindingMetadata: script.bindings },
        });
        if (compiled.errors.length) throw compiled.errors[0];
        const helpers = [...compiled.code.matchAll(/(\w+) as (_\w+)/g)];
        const body = compiled.code.replace(/import \{[\s\S]*?\} from "vue"\s*/, '').replace('export function render', 'return function render');
        view.render = new Function(...helpers.map((item) => item[2]), body)(...helpers.map((item) => vueRuntime[item[1]]));
        view.ssrRender = undefined;
        mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
        app = vueRuntime.createApp(view, { facts, truthVersion: 'tv-cc1b', campaignKey: 'camp-cc1b', shown: true });
        app.provide(Symbol.for('v-scx'), { modules: new Set() });
        app.config.errorHandler = (err) => { throw err; };
        const host = document.createElement('div');
        document.body.appendChild(host);
        app.mount(host);
        const words = host.querySelector('[data-trx-words]');
        assert.ok(words, 'the transcript is on the page');
        assert.match(words.textContent, /Awaiting transmission/);
        mock.timers.tick(TIMING.beaconDelayMs - 1);
        assert.match(words.textContent, /Awaiting transmission/);
        mock.timers.tick(1);
        assert.match(words.textContent, /Welcome to Regina/);
        const said = host.querySelector('[data-trx-a11y]');
        assert.match(said.textContent, /Welcome to Regina/);
        assert.match(host.textContent, /SYSTEM COMMS/);
        assert.equal(host.querySelector('.trx-receiver').getAttribute('aria-label'), 'System communications');
        assert.equal(host.querySelector('[data-trx-sig]').getAttribute('data-signal'), '0');
        app.unmount();
        app = null;

        const prevMatch = globalThis.matchMedia;
        const prevRaf = globalThis.requestAnimationFrame;
        const prevCancel = globalThis.cancelAnimationFrame;
        const prevPerf = globalThis.performance;
        let clock = 0;
        const queue = [];
        globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
        globalThis.performance = { now: () => clock };
        globalThis.requestAnimationFrame = (fn) => {
            queue.push(fn);
            return queue.length;
        };
        globalThis.cancelAnimationFrame = () => { queue.length = 0; };
        const probe = document.createElement('section');
        probe.innerHTML = '<span data-trx-channel>CH 03</span><span data-trx-kind>LOCAL</span><span data-trx-source>PORT</span><div data-trx-speaker>OPEN BAND</div><div data-trx-copy><div data-trx-words>Awaiting transmission</div></div><span data-trx-a11y></span><span data-trx-status>MONITORING</span><span data-trx-band>OPEN BAND</span><span data-trx-clock>00:00:00</span><span data-trx-sig data-signal="0"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span><svg><path data-trx-trace></path><path data-trx-ghost></path><line data-trx-playhead></line><rect data-trx-headhalo></rect><path data-trx-ticks></path></svg>';
        document.body.appendChild(probe);
        const screen = mountCommsReceiver(probe);
        const level = () => Number(probe.querySelector('[data-trx-sig]').getAttribute('data-signal'));
        const step = (ms) => {
            const end = clock + ms;
            while (clock < end) {
                const slice = Math.min(16, end - clock);
                clock += slice;
                mock.timers.tick(slice);
                const batch = queue.splice(0, queue.length);
                for (const fn of batch) fn(clock);
            }
        };
        step(32);
        assert.equal(level(), 0);
        screen.transmit({ from: 'PORT CONTROL', text: 'Hold short', ch: 'CH 03', type: 'LOCAL APPROACH' });
        step(32);
        assert.equal(level(), 0);
        step(900);
        assert.ok(level() > 0, 'mid-transmission signal ' + level());
        step(4000);
        assert.equal(level(), 0);
        screen.destroy();
        document.body.removeChild(probe);
        globalThis.matchMedia = prevMatch;
        globalThis.requestAnimationFrame = prevRaf;
        globalThis.cancelAnimationFrame = prevCancel;
        globalThis.performance = prevPerf;
    } finally {
        if (app) app.unmount();
        mock.timers.reset();
        await server.close();
        fs.rmSync(cacheDir, { recursive: true, force: true });
    }
});
