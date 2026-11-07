/**
 * The characters this member is tied to, in the browser (DS6; Johnny 141). The server keeps
 * the tie (`universe_members.person_id`; B's BM2a makes it a list) and reads it on every
 * append, but no route tells a member their own list yet: the players read is the referee's,
 * and the players page carries no `you`. Until that read exists this seam holds what the app
 * learns elsewhere (the join page's "Which one is you" answer, a later read), and the ship's
 * screens ask it. Empty, a player reads the locker and acts on nothing.
 */
import { reactive } from 'vue';

export const me = reactive({
    /** The ids of the party characters tied to this member, the first the one the append door names today. */
    personIds: [] as string[],
});

export function myPersonIds(): readonly string[] {
    return me.personIds;
}

export function setMyPersonIds(ids: readonly string[]): void {
    me.personIds = [...ids];
}

export function isMine(personId: string): boolean {
    return me.personIds.includes(personId);
}
