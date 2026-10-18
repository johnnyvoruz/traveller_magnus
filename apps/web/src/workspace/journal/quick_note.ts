/**
 * Quick capture (streams/D.md DU7; UX backlog U7): a one-line note typed on the map, kept as a journal
 * note that mentions where the referee was looking: the selected hex and the record open in the
 * campaign panel. The mentions are the tokens a journal body already carries (`[[hex:…|name]]`,
 * `[[cr_…|name]]`), so the note's mentions are read from its body as any note's are. Pure.
 */
import { mentionToken } from './mention.ts';

/** What the map knew when the box opened. Either may be absent. */
export type CaptureContext = {
    hex: { key: string; name: string } | null;
    record: { id: string; name: string } | null;
};

/** The note's body: the words typed, then the mentions on a line of their own. Empty words make no note. */
export function quickNoteBody(text: string, context: CaptureContext): string | null {
    const words = text.replace(/\s+/g, ' ').trim();
    if (!words) return null;
    const tokens: string[] = [];
    if (context.hex) tokens.push(mentionToken('hex:' + context.hex.key, context.hex.name));
    if (context.record) tokens.push(mentionToken(context.record.id, context.record.name));
    return tokens.length ? words + '\n\n' + tokens.join(' ') : words;
}

/** What the box says it will mention, in words. */
export function captureWhere(context: CaptureContext): string {
    const parts = [context.hex ? context.hex.name : '', context.record ? context.record.name : ''].filter(Boolean);
    return parts.length ? 'Mentions ' + parts.join(' and ') + '.' : '';
}
