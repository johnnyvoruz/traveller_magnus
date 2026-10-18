/**
 * The Campaign breadcrumb. One level in, the trail is Campaign, the list the person
 * came from, then the page. At full width the list is already on screen, so the middle
 * part is left off. Pure: the panel turns a part into an address.
 */

export type CrumbGo = 'campaign' | 'records' | 'journal';

export type CrumbPart = {
    label: string;
    /** Null on the page the person is on. */
    go: CrumbGo | null;
};

export type CrumbLevel = 'record' | 'entry' | 'party' | 'timeline' | 'web';

/** The words of the trail, in order. The last part is the page and is not a link. */
export function campaignCrumb(input: {
    level: CrumbLevel;
    /** The list stands beside the page, so a middle part would repeat it. */
    beside: boolean;
    /** The list as it was: "People", "People matching “voss”", "Journal". */
    middle: string;
    pageName: string;
}): CrumbPart[] {
    const here: CrumbPart = { label: input.pageName, go: null };
    if (input.level === 'timeline') return [{ label: 'Campaign', go: 'campaign' }, { label: 'Timeline', go: null }];
    if (input.level === 'web') return [{ label: 'Campaign', go: 'campaign' }, { label: 'Relationships', go: null }];
    if (input.level === 'party') return [{ label: 'Campaign', go: 'campaign' }, { label: 'Party', go: null }];
    const parent: CrumbGo = input.level === 'entry' ? 'journal' : 'records';
    if (input.beside) return [{ label: 'Campaign', go: parent }, here];
    return [{ label: 'Campaign', go: 'campaign' }, { label: input.middle, go: parent }, here];
}

/** The middle part: the type's plural, or "Records", plus a search when one is on. */
export function listCrumbLabel(many: string, query: string): string {
    const base = many.trim() || 'Records';
    const text = query.trim();
    return text ? base + ' matching “' + text + '”' : base;
}

/** A person or a character is a circle. Every other kind is a square. */
export function avatarShape(type: string): 'circle' | 'square' {
    return type === 'person' || type === 'character' ? 'circle' : 'square';
}
