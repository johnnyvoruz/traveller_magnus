/**
 * The timeline row another page asked to be shown. A record page sets it; the Campaign panel
 * opens the timeline when it changes, and the timeline opens at that row instead of at Today,
 * then clears it. Null when nothing is asked for.
 */
import { ref } from 'vue';

export const timelineAt = ref<string | null>(null);
