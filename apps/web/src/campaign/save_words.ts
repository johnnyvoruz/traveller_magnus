/**
 * The words for a save that did not land (Lane D's DF32, B's BP3 question 2; Johnny's 122). `commit.ts` keeps
 * `lastError` as `offline` when the connection dropped, or as the server's own sentence when it refused the
 * save ("Too many requests.", "Invalid request."): the screens show that sentence where they said offline,
 * and the save is sent again either way. Pure.
 */

/** The strip's words when the connection dropped. */
export const NOT_SAVED = 'That change was not saved. Your text is still here.';

/** `lastError` as the server's sentence, or null when it is offline or clean. */
export function refusalSentence(error: string): string | null {
    const sentence = error.trim();
    return sentence && sentence !== 'offline' ? sentence : null;
}

/** The strip under a page: "That change was not saved: Too many requests. Your text is still here." */
export function saveFailedWords(error: string): string {
    const sentence = refusalSentence(error);
    return sentence ? 'That change was not saved: ' + sentence + ' Your text is still here.' : NOT_SAVED;
}

/** The short status beside Saved: "Not saved" / "Not saved: Too many requests." */
export function notSavedWords(error: string): string {
    const sentence = refusalSentence(error);
    return sentence ? 'Not saved: ' + sentence : 'Not saved';
}
