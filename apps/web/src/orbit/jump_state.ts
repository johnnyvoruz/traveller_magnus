/**
 * The destination system marked for a jump (K12 point 5), kept across the trip to the map
 * and back: "Pick on the map" leaves the orbit view, the map hands the system over
 * (workspace/pick.ts), and the orbit view finds it here when it returns.
 */
import { ref } from 'vue';
import type { PickedSystem } from '../workspace/pick.ts';

export const jumpTarget = ref<PickedSystem | null>(null);

/** The orbit route to come back to after a pick on the map. */
export const jumpReturnPath = ref<string | null>(null);
