/**
 * Bold, italic, lists, and links over the journal's plain text. Stored text stays text.
 * A tag in the source stays text. A link is an http or https address, or it stays text.
 * A mention token stays one chip, including inside bold, italic, a link label, or a list item.
 */
import { mentionAt } from './body.ts';

export type RichNode =
    | { kind: 'text'; text: string }
    | { kind: 'bold'; children: RichNode[] }
    | { kind: 'italic'; children: RichNode[] }
    | { kind: 'link'; href: string; children: RichNode[] }
    | { kind: 'list'; items: RichNode[][] }
    | { kind: 'break' }
    | { kind: 'record'; id: string; label: string }
    | { kind: 'hex'; hexKey: string; label: string };

type NameOf = (target: string) => string | null;

function pushText(nodes: RichNode[], text: string): void {
    if (!text) return;
    const last = nodes[nodes.length - 1];
    if (last && last.kind === 'text') last.text += text;
    else nodes.push({ kind: 'text', text });
}

function findMarker(text: string, from: number, end: number, marker: '**' | '*', nameOf: NameOf): number {
    let i = from;
    while (i < end) {
        const mention = mentionAt(text, i, nameOf);
        if (mention && mention.end <= end) {
            i = mention.end;
            continue;
        }
        if (marker === '**' && text.startsWith('**', i)) return i;
        if (marker === '*' && text[i] === '*' && !text.startsWith('**', i)) return i;
        i += 1;
    }
    return -1;
}

/** An address this renderer may put on a link. Anything else stays text. */
function httpHref(raw: string): string | null {
    if (!raw || /[\s"'<>]/.test(raw)) return null;
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return null;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href;
}

function readLink(text: string, start: number, end: number, nameOf: NameOf): { node: RichNode; next: number } | null {
    let j = start + 1;
    while (j < end) {
        const mention = mentionAt(text, j, nameOf);
        if (mention && mention.end <= end) {
            j = mention.end;
            continue;
        }
        if (text[j] === '\n' || text[j] === '\r') return null;
        if (text[j] === ']') break;
        j += 1;
    }
    if (j >= end || text[j] !== ']' || text[j + 1] !== '(') return null;
    const urlStart = j + 2;
    let urlEnd = urlStart;
    while (urlEnd < end && text[urlEnd] !== ')') urlEnd += 1;
    if (urlEnd >= end) return null;
    const href = httpHref(text.slice(urlStart, urlEnd));
    if (!href) return null;
    return {
        node: { kind: 'link', href, children: parseRange(text, start + 1, j, nameOf) },
        next: urlEnd + 1,
    };
}

function parseRange(text: string, start: number, end: number, nameOf: NameOf): RichNode[] {
    const nodes: RichNode[] = [];
    let i = start;
    while (i < end) {
        const mention = mentionAt(text, i, nameOf);
        if (mention && mention.end <= end) {
            nodes.push(mention.part);
            i = mention.end;
            continue;
        }
        if (text.startsWith('**', i)) {
            const close = findMarker(text, i + 2, end, '**', nameOf);
            if (close >= 0) {
                nodes.push({ kind: 'bold', children: parseRange(text, i + 2, close, nameOf) });
                i = close + 2;
                continue;
            }
            pushText(nodes, '**');
            i += 2;
            continue;
        }
        if (text[i] === '*') {
            const close = findMarker(text, i + 1, end, '*', nameOf);
            if (close >= 0) {
                nodes.push({ kind: 'italic', children: parseRange(text, i + 1, close, nameOf) });
                i = close + 1;
                continue;
            }
            pushText(nodes, '*');
            i += 1;
            continue;
        }
        if (text[i] === '[' && text[i - 1] !== '!') {
            const link = readLink(text, i, end, nameOf);
            if (link) {
                nodes.push(link.node);
                i = link.next;
                continue;
            }
            pushText(nodes, '[');
            i += 1;
            continue;
        }
        let next = i + 1;
        while (next < end && text[next] !== '*' && text[next] !== '[') next += 1;
        pushText(nodes, text.slice(i, next));
        i = next;
    }
    return nodes;
}

function parseInline(text: string, nameOf: NameOf): RichNode[] {
    return parseRange(text, 0, text.length, nameOf);
}

/** The text as nodes. `nameOf` returns a record's or a system's current name, or null. */
export function parseRich(text: string, nameOf: NameOf = () => null): RichNode[] {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const nodes: RichNode[] = [];
    let i = 0;
    while (i < lines.length) {
        if (lines[i].startsWith('- ')) {
            const items: RichNode[][] = [];
            while (i < lines.length && lines[i].startsWith('- ')) {
                items.push(parseInline(lines[i].slice(2), nameOf));
                i += 1;
            }
            nodes.push({ kind: 'list', items });
        } else {
            nodes.push(...parseInline(lines[i], nameOf));
            i += 1;
        }
        if (i < lines.length) nodes.push({ kind: 'break' });
    }
    return nodes;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** The nodes as HTML. Text is escaped. A chip is its label. A link opens in a new tab. */
export function richHtml(nodes: readonly RichNode[]): string {
    let out = '';
    for (const node of nodes) {
        if (node.kind === 'text') out += escapeHtml(node.text);
        else if (node.kind === 'bold') out += '<strong>' + richHtml(node.children) + '</strong>';
        else if (node.kind === 'italic') out += '<em>' + richHtml(node.children) + '</em>';
        else if (node.kind === 'link') {
            out += '<a href="' + escapeHtml(node.href) + '" target="_blank" rel="noopener noreferrer nofollow">'
                + richHtml(node.children) + '</a>';
        } else if (node.kind === 'list') {
            out += '<ul>' + node.items.map((item) => '<li>' + richHtml(item) + '</li>').join('') + '</ul>';
        } else if (node.kind === 'break') out += '<br>';
        else out += escapeHtml(node.label);
    }
    return out;
}
