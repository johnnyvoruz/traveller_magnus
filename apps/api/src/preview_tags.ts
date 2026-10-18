// Parked until Johnny turns it on.
/**
 * Pure social-tag rewrite (Epic L, L5).
 * The tags Lane C put in apps/web/index.html are replaced in place. Missing tags are not added.
 */

/** True when text/html or xhtml outranks every other concrete type. A wildcard alone does not count as a preference. */
export function prefersHtml(accept: string | null): boolean {
    if (!accept) return false;
    let html = -1;
    let other = -1;
    for (const part of accept.split(',')) {
        const bits = part.trim().split(';').map((item) => item.trim()).filter(Boolean);
        const type = (bits[0] ?? '').toLowerCase();
        if (!type) continue;
        let q = 1;
        for (const bit of bits.slice(1)) {
            const [key, value] = bit.split('=').map((item) => item.trim());
            if (key === 'q') {
                const parsed = Number(value);
                if (Number.isFinite(parsed)) q = parsed;
            }
        }
        if (!(q > 0)) continue;
        if (type === 'text/html' || type === 'application/xhtml+xml') html = Math.max(html, q);
        else if (type !== '*/*') other = Math.max(other, q);
    }
    return html >= 0 && html >= other;
}

function escapeText(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(value: string): string {
    return escapeText(value).replace(/"/g, '&quot;');
}

function setMeta(html: string, attr: 'name' | 'property', key: string, content: string): string {
    const pattern = new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`, 'i');
    if (!pattern.test(html)) return html;
    return html.replace(pattern, `$1${content}$2`);
}

/** Replace the existing title, description, and image tags. Missing tags are not added. */
export function applyTags(html: string, tags: { title: string; description: string; image?: string }): string {
    const title = escapeText(tags.title);
    const description = escapeAttr(tags.description);
    let next = html.replace(/<title>[^<]*<\/title>/i, `<title>${title}</title>`);
    next = setMeta(next, 'name', 'description', description);
    next = setMeta(next, 'property', 'og:title', escapeAttr(tags.title));
    next = setMeta(next, 'property', 'og:description', description);
    if (tags.image) next = setMeta(next, 'property', 'og:image', escapeAttr(tags.image));
    return next;
}
