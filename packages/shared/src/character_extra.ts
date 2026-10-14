/**
 * Skill lines past the PDF's own numbered rows. The PDF keeps lines 1 onward under its
 * own names; a further line is stored here, under a name the PDF does not have.
 * `EXTRA_LINE_GUARD` is a guard against junk names, not a design cap.
 */

export const EXTRA_LINE_MIN = 4;
/** A name past this is refused. The sheet itself does not stop offering another line. */
export const EXTRA_LINE_GUARD = 99;

export type ExtraPart = 'Specialism' | 'Modifier';

export type ExtraLineName = {
    label: string;
    n: number;
    part: ExtraPart;
};

const EXTRA_NAME = /^Extra\/([^/]+)\/([1-9]\d?)\/(Specialism|Modifier)$/;
const NUMBERED_MODIFIER = /^(.*?) (\d+) Modifier$/;

/** `Extra/<skill label>/<n>/Specialism` or `Modifier`. `<skill label>` is the PDF line's label. */
export function extraFieldName(label: string, n: number, part: ExtraPart): string {
    return 'Extra/' + label + '/' + n + '/' + part;
}

/**
 * Skills the PDF prints as numbered lines, from those lines' modifier names
 * (`"Athletics 1 Modifier"`). The caller passes the PDF's field names. This file
 * does not list the skills.
 */
export function numberedSkillLabels(fieldNames: readonly string[]): ReadonlySet<string> {
    const labels = new Set<string>();
    for (const name of fieldNames) {
        const found = NUMBERED_MODIFIER.exec(name);
        if (found?.[1]) labels.add(found[1]);
    }
    return labels;
}

/**
 * A name is an extra line only when its label is one of `numberedLabels` and `n` is an
 * integer from {@link EXTRA_LINE_MIN} to {@link EXTRA_LINE_GUARD}. Otherwise null.
 */
export function parseExtraName(name: string, numberedLabels: ReadonlySet<string>): ExtraLineName | null {
    const found = EXTRA_NAME.exec(name);
    if (!found) return null;
    const label = found[1];
    if (!label || !numberedLabels.has(label)) return null;
    const n = Number(found[2]);
    if (!Number.isInteger(n) || n < EXTRA_LINE_MIN || n > EXTRA_LINE_GUARD) return null;
    const part = found[3];
    if (part !== 'Specialism' && part !== 'Modifier') return null;
    return { label, n, part };
}
