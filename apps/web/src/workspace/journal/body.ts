/**
 * A journal body as it is read (journal design §4). Plain text: line breaks stay, and nothing
 * is HTML. A token [[cr_<uuid>|label]] or [[hex:Sector/1910|label]] is a chip. The label is
 * only a fallback; the name is the record's or the system's when `nameOf` has one. Anything
 * else, including a tag, stays text.
 */
export type BodyPart =
    | { kind: 'text'; text: string }
    | { kind: 'record'; id: string; label: string }
    | { kind: 'hex'; hexKey: string; label: string };

const TOKEN = /\[\[(cr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|hex:[^/\]|]+\/\d{4})(?:\|([^\]]*))?\]\]/gi;

function chipLabel(target: string, written: string | undefined, nameOf: (target: string) => string | null): string {
    const named = nameOf(target);
    if (named && named.trim()) return named.trim();
    const fallback = written ? written.trim() : '';
    if (fallback) return fallback;
    if (target.startsWith('hex:')) {
        const key = target.slice(4);
        const cut = key.lastIndexOf('/');
        return cut >= 0 ? key.slice(0, cut).replace(/_/g, ' ') + ' ' + key.slice(cut + 1) : key;
    }
    return target;
}

/** The body split into text and chips, in order. `nameOf` returns the current name, or null. */
export function bodyParts(text: string, nameOf: (target: string) => string | null): BodyPart[] {
    const parts: BodyPart[] = [];
    let at = 0;
    for (const match of text.matchAll(TOKEN)) {
        const index = match.index ?? 0;
        if (index > at) parts.push({ kind: 'text', text: text.slice(at, index) });
        const target = match[1] ?? '';
        const label = chipLabel(target, match[2], nameOf);
        if (target.startsWith('hex:')) parts.push({ kind: 'hex', hexKey: target.slice(4), label });
        else parts.push({ kind: 'record', id: target, label });
        at = index + match[0].length;
    }
    if (at < text.length) parts.push({ kind: 'text', text: text.slice(at) });
    if (parts.length === 0) parts.push({ kind: 'text', text });
    return parts;
}
