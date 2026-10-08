/**
 * What the record list is asked to show next: the search the omnibox hands over with "All N
 * matches", and the sort the referee last chose. The list reads and clears the search when
 * it is shown.
 */
import { reactive, ref } from 'vue';

/** A search to apply when the list is next shown; empty when none. */
export const handedQuery = ref('');

export type ListSort = 'name' | 'changed';

/** The list's order: by name, or by what changed last. */
export const listSort = ref<ListSort>('name');

/** The date beside the search bar was pressed: the panel opens its date for editing when it is next ready. */
export const editDateNext = ref(false);

/** The ship sheet's sections folded by the referee, by section key, kept for the session. */
export const sheetFolded = reactive<Record<string, boolean>>({});

/** The character sheet's sections folded by the referee, by person and then by section name, kept for the session. */
export const characterFolded = reactive<Record<string, Record<string, boolean>>>({});
