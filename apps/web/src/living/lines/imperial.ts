/** Imperial public traffic: additions requested by Johnny, with court/civic flavour.
 * Nobility follows the user-supplied SOC excerpt: status is not automatically a
 * title, and relatives do not inherit the title of the person they accompany.
 * Institutions and daily appointments below are fictional background colour.
 * Cx = capital in https://travellermap.com/doc/secondsurvey; not Cp or Cs.
 */
import { ChatterLine, type ChatterLineData } from '@voyage/shared';

export const imperialSources = new Map<string, { speaker: string; channel: 'common' | 'services' }>();

function group(start: number, speaker: string, capital: boolean, texts: string[]): ChatterLineData[] {
    return texts.map((text, i) => {
        const id = `ship-${start + i}`;
        imperialSources.set(id, { speaker, channel: 'services' });
        return ChatterLine.parse({ id, category: 'ship', voice: 'crew', text,
            when: { allegiance: ['Im'], starport: ['A', 'B', 'C', 'D'], pop: { min: 5 },
                ...(capital ? { tradeCodes: ['Cx'] } : {}) },
        });
    });
}

export const imperialLines: ChatterLineData[] = [
    ...group(400, 'Household Launch', false, [
        'The duke is remaining aboard for the provincial accounts briefing. His party may proceed to the reception. He sends his apologies and the signed endowment.',
        'Protocol, the baroness is travelling with her daughter. One title on the introduction, please. Her daughter has asked to be introduced as the expedition scientist.',
        'Household transport, the count has moved the audience to his working office. Leave the ceremonial cloak with the steward; bring the survey projections.',
        'The marquis has received the petitioners. Their return launch can depart after the interpreters finish recording the replies.',
        'Ceremonial transport, the newly appointed knight has asked whether the insignia travels in hand luggage. We have assured him somebody will meet him.',
        'The duke\'s nephew is on the guest list under his own name. He is not the duke. Please amend the welcome display before he sees it.',
        'Household launch to reception. The countess has brought the scholarship recipients with her. Please keep their seats together; this is their first offworld visit.',
        'The baron has finished the water-project review. His staff are sending the engineering questions ahead of the dinner seating plan.',
    ]),
    ...group(408, 'Diplomatic Reception', false, [
        'Delegation shuttle, your interpreters are ready. We have the formal greetings in six languages and the seating plan in its ninth revision.',
        'The ambassador\'s gift is a living garden under glass. Environmental staff will receive it before the presentation party.',
        'Diplomatic reception to the visiting launch. We have corrected the flag order. Thank you for catching it before the public feed went live.',
        'The envoy requests a private channel for scheduling, not a priority landing. Please leave the normal traffic sequence intact.',
        'Delegation baggage is accounted for. The long case contains the ceremonial staff; it is not part of the shuttle\'s sensor array.',
        'The visiting delegation has accepted the translation of the toast. The joke in the third line will remain untranslated by mutual agreement.',
        'Reception to ceremonial transport. The delegation would like a moment beside the Imperial standard for their group image before boarding.',
        'The diplomatic launch has the sealed reply aboard. The receiving mission will acknowledge it when the courier delivers the packet.',
    ]),
    ...group(416, 'Imperial Liaison', false, [
        'The infrastructure hearing has adjourned. Delegates, take the annotated models with you; the projection system will not retain your private notes.',
        'Imperial liaison to the courier desk. The provincial returns arrived on three different ships. Please preserve their individual dispatch dates.',
        'The public gallery for the charter presentation is full. The overflow projection is available in the arrivals concourse.',
        'Imperial service veterans, your reception launch is boarding. The school choir has asked to perform the welcome in person.',
        'The petitions office has extended its translation session. Representatives waiting on a transcript may keep their existing transport booking.',
        'The delegation brought a scale model of its proposed orbital works. We have booked a cargo cradle and a larger briefing room.',
        'Liaison to the merchant delegation. Your port-access petition is on the afternoon docket. Please bring the traffic figures as well as the signatures.',
        'The Imperial archive has accepted the expedition record. Public copies will follow after the survey team checks the place names.',
    ]),
    ...group(424, 'Capital Protocol', true, [
        'Capital protocol to the audience launches. The first reception group is assembled. Keep the heraldic transponder overlays active until arrival processing is complete.',
        'Court reception, the provincial delegation has arrived with its original charter. The archive team will escort the document; protocol will escort the people.',
        'Capital ceremonial transport. The standard-bearers are ready. Please secure the poles before engaging cabin gravity; we have rehearsed this part.',
        'Court protocol to the visiting households. The presentation order has been issued. Rank governs the introductions, not who reaches the launch hatch first.',
        'The palace reception feed is now available to the public galleries. The heralds have requested that personal commentary stay off the interpretation channels.',
        'Capital protocol. The planetary delegates have assembled beneath their banners. The projection team is checking the colour of every world before the opening address.',
        'Court transport, the duke\'s audience has concluded. His administrative staff remain for the afternoon session. There are rather more of them than arrived with him.',
        'The investiture rehearsal is complete. The new knights may collect their personal effects. The ceremonial insignia stays with the attendants until the presentation.',
    ]),
    ...group(432, 'Palace Services', true, [
        'Palace services to the supply launch. The banquet flowers need their own atmosphere settings. Please keep the sealed garden cases on independent power.',
        'The ceremonial grav platforms have completed their alignment check. The procession should appear effortless. The engineering team would like that recorded.',
        'Palace stores, the visiting households have sent their dining requirements. The galley has produced a seating model with more colours than the heraldry display.',
        'The monumental facade projectors are aligned. From orbit the Imperial emblem will resolve as one image. Down here it is still several crews on a service channel.',
        'Palace archive transfer ready. Four sealed memory cores, two conservators, and one original document that nobody wants near a cleaning drone.',
        'Ceremonial guard transport, the relief detail is aboard. Their armour is polished, their boots are counted, and the musicians are on the following launch.',
        'Palace services, the reception fountains have returned to their normal gravity profile. The practice water is back in the recovery tanks.',
        'The receiving hall canopy is showing the night skies of the visiting worlds. Their astronomers have supplied corrections. Please use the corrected stars.',
    ]),
    ...group(440, 'Capital Public Gallery', true, [
        'Public gallery transport, the celebrated author is travelling without a title. Her readership appears to have arrived ahead of her. We are opening another boarding lane.',
        'The war hero has requested to enter with the rest of her old crew. Please amend the camera positions; she does not want them cropped out.',
        'Gallery attendants, the duke has gone to his next appointment. The person still signing programmes is the composer. Yes, that is the longer queue.',
        'Capital public gallery. The provinces\' gift exhibition is ready for visitors: living coral under pressure, woven light, and a stone older than the Imperium.',
        'The reception portraits are on the public feed. Household staff, please check names and titles before approving the captions. Fame is not a hereditary office.',
        'Capital gallery launch, the school group has finished watching the ceremonial arrivals. Every child now wants a heraldic transponder for their luggage.',
        'The delegation from the outer worlds has sent a choir recording for the closing ceremony. It travelled farther than anyone in the sound booth has ever been.',
        'Public gallery to the departing delegation. Your petition was received, your group portrait is ready, and someone left a ceremonial hat beside the planetary model.',
    ]),
];
