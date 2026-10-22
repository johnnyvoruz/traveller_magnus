/**
 * Switch and ticker words (spec_living_systems.md sections 1 and 4).
 * The settings screen already shows the same sentences. The ticker is later.
 */
export const LIVING_WORDS = {
    chatterLabel: 'Show system chatter',
    chatterHelp: 'Short radio and news lines while a system is open. Players see them too.',
    trafficLabel: 'Show background traffic',
    trafficHelp: "Ships that come and go in the orbit view. They're scenery, not tracked ships.",
    quietLabel: 'Quiet on this device',
    quietHelp: 'Hides chatter and background traffic on this device only.',
    trafficChip: 'Traffic',
    hideVisit: 'Hide for this visit',
} as const;
