/** Background broadcasts requested by Johnny: commerce, civic calls and partisan spots.
 * Offers/prices are fictional colour, not playable market inventory or rules.
 * Police numbers are invented local radio shorthand, not a universal codebook.
 * Animals: rules/mgt2e_trade.json, Live Animals (riding animals, burden beasts, pets).
 * Psionics attitude: assets/2eWorldCreation.txt:961 and the user's polity direction;
 * Zhodani background: mongoosepublishing.com/products/alien-module-4-zhodani-ebook-2.
 * Credit doubling is an original nod to Jita local, not copied EVE dialogue.
 */
import { ChatterLine, type ChatterLineData, type ChatterWhenData } from '@voyage/shared';
import { nodLines, nodSources } from './nods.ts';

export const broadcastSources = new Map<string, { speaker: string; channel: 'common' | 'services' }>(nodSources);

function group(category: ChatterLineData['category'], start: number, speaker: string,
    channel: 'common' | 'services', when: ChatterWhenData, texts: string[], weight = 1): ChatterLineData[] {
    return texts.map((text, i) => {
        const id = `${category}-${start + i}`;
        broadcastSources.set(id, { speaker, channel });
        return ChatterLine.parse({ id, category,
            voice: category === 'advert' ? 'advert' : category === 'customs' ? 'customs' : category === 'control' ? 'control' : 'crew',
            text, weight, when: { pop: { min: 1 }, party: ['inSystem', 'docked'], ...when } });
    });
}

const staffed = ['A', 'B', 'C', 'D'] as const;
export const broadcastLines: ChatterLineData[] = [
    ...group('advert', 200, 'Open Trade Channel', 'common', { starport: ['A', 'B'], pop: { min: 7 }, law: { max: 3 } }, [
        'Double your credits! Send one thousand, receive two thousand. Read the terms in my public registry entry. Yes, all nineteen pages.',
        'Leaving the system for good. Everything must go. My accountant says I cannot keep announcing that every week.',
        'One lucky caller gets the mystery cargo container. Contents guaranteed to be inside. Container sold separately.',
        'Two-for-one credit exchange, captains. Limited offer. If you heard this offer yesterday, that was the previous limited offer.',
        'Retiring merchant shares fortune with passing crews. Testimonials available from three entirely independent people with the same surname.',
        'Final clearance on premium cargo lots. The word premium describes the listing service, not the contents. Please read before transmitting funds.',
    ], 0.25),
    ...group('advert', 206, 'Ship Exchange', 'common', { starport: ['A', 'B'], pop: { min: 6 } }, [
        'Pre-owned free trader, inspection welcome. A good honest hull with room for a growing business. The mural in the crew lounge is negotiable.',
        'One owner, full service history, and a captain who kept every receipt. Used launch viewings by appointment through the exchange.',
        'Looking for your first ship? Bring an engineer to our viewing day. We would rather answer the awkward questions before you sign.',
        'Working cargo launch for sale. Fresh upholstery, documented engine service, and absolutely no claim that upholstery improves performance.',
        'Selling your ship? Our listing package includes interior photographs taken with the lights on. Let buyers see what they are getting.',
        'Trade up to a roomier cabin. Selected used vessels open for inspection today. Please remove magnetic work boots before trying the bunks.',
    ], 0.4),
    ...group('advert', 212, 'Chandlery Channel', 'common', { starport: [...staffed], tl: { min: 8 } }, [
        'Replacement seals, suit fittings, and the small adapter you meant to buy at the last port. Send the part number; we will check the shelf.',
        'Shipboard coffee makers serviced while you wait. Your jump drive gets an engineer. Give the other essential machinery the same consideration.',
        'Cargo restraints sold in matched sets. Colours available for crews who prefer to know whose strap they are borrowing.',
        'Refurbished tool lockers, complete with working catches. Tools not included, despite what our demonstrator keeps saying.',
        'Cabin acoustic lining fitted to order. Hear less of your neighbour rehearsing, and more of your own thoughts.',
        'Personal comms repaired and cleaned. We can replace a cracked screen. We cannot explain that message from your former captain.',
    ], 0.4),
    ...group('ship', 336, '{ship}', 'services', { starport: [...staffed], tl: { min: 10 } }, [
        'Gravity service crew, the galley deck is level again. We found the missing spoon when it stopped orbiting the soup.',
        'Our cabin gravity test is complete. Everyone stayed seated, except the plant. We will secure the plant next time.',
        'Maintenance, the exercise deck is back on its normal setting. Please tell the lieutenant his personal lifting record needs an asterisk.',
        'The gravity plate beneath the card table has been recalibrated. We are replaying the last hand by mutual agreement.',
        'Service crew, the corridor no longer feels uphill in both directions. That is a considerable improvement.',
        'Gravity checks complete, loose items accounted for. The breakfast roll on the overhead was there before the test.',
    ]),
    ...group('control', 200, '{world} Port Patrol', 'services', { starport: [...staffed], pop: { min: 5 }, law: { min: 4 } }, [
        'Control, Two-Seven. At twelve-four, item six resolved. Owner has the case. Two-Seven clear.',
        'Three-One to desk. Reference eight-two-six, bay fourteen. Both parties present. Request a cargo clerk, routine attendance.',
        'Desk, Four-Two. Seven checked, seven clear. Moving to concourse three. Next check at thirty.',
        'Two-Four, copy amendment to five-one-eight. Blue cargo drone, not blue luggage. Returning to the collection point.',
        'Desk to Six-Three. Reference nine-four closed. Property receipt signed. Resume circuit two.',
        'One-Eight to control. Six at the desk, six reunited with the tour group. Guide requests a louder flag. One-Eight available.',
    ]),
    ...group('customs', 200, '{world} Animal Clearance', 'services', { starport: [...staffed] }, [
        'Live-animal consignment, send the health certificates with the species list. The inspector needs both before opening the transport plan.',
        'Handlers, keep the feed containers with their matching enclosures. Similar-looking pellets are not necessarily the same diet.',
        'Veterinary inspection party ready for your shipment. Please have a handler meet us and leave the transport enclosures secured.',
        'Please keep companion animals in their carriers during this inspection. Being friendly is welcome; helping inspect the bags is not.',
        'Quarantine transfer team to the livestock carrier. Keep your environmental settings unchanged until our handler has checked the receiving enclosure.',
        'Animal clearance to the delivery crew. Mark the enclosure that opens from above. Our inspector would prefer to meet the occupant from the intended direction.',
    ]),
    ...group('ship', 342, '{ship}', 'common', { tradeCodes: ['Ag', 'Ga'], starport: [...staffed] }, [
        'Livestock load settled. The riding animals seem to like the engine note. Our handler says the humming is a good sign.',
        'Breeding stock aboard, handlers counted, feed secured. There are more names on the animal roster than on the crew list.',
        'Please keep the loading ramp quiet for the next group. They follow the lead animal beautifully until someone applauds.',
        'The burden beasts are in their travel pens. The smallest one has claimed the largest pen, and the handler has accepted the arrangement.',
        'Our animal handler requests the shaded loading slot. We can move the empty containers first while the herd settles.',
        'Live cargo tally complete. The new offspring has been added to the manifest. The crew is still voting on a name.',
    ]),
    ...group('ship', 348, '{ship}', 'common', { starport: [...staffed] }, [
        'The companion animal is back in its carrier. It was asleep in the warm laundry. Search complete; towels may now resume normal service.',
        'Vet launch, our passenger has the feeding notes and travel records ready. She also has several hundred photographs, if those help.',
        'Please do not tap the transparent enclosure. The animal taps back, and its handler says that is a courtship behaviour.',
        'Our ship pet has learned the arrival chime. It is sitting beside its carrier before we have even packed.',
        'Animal handler to the cargo team. That display is a warning, not a request for a scratch. Give it space and let me approach.',
        'Delivery crew, the enclosure has its own air supply. Keep the service connection clear when you strap it down.',
    ]),
    ...group('advert', 218, 'Imperial Civic Broadcast', 'common', { allegiance: ['Im'], starport: [...staffed], pop: { min: 5 } }, [
        'Imperial civic message: your thoughts are your own. No promise of insight is worth surrendering the privacy of your mind.',
        'Confidence comes from evidence, not claims of secret mental powers. Ask questions. Demand proof. An informed citizen strengthens the Imperium.',
        'Our differences are a source of strength. Our shared loyalty carries us between the stars. An Imperial civic broadcast.',
        'A neighbour earns your trust through deeds. No stranger should demand it by claiming to see inside your mind.',
        'The stars are distant. Our obligations to one another are close at hand. Serve your community; strengthen the Imperium.',
        'Psionic promises offer certainty without evidence. Keep your judgment your own. This message is part of the Imperial civic series.',
    ], 0.25),
    ...group('advert', 224, 'Consular Civic Broadcast', 'common', { allegiance: ['Zh'], starport: [...staffed], pop: { min: 5 } }, [
        'A trained psionic gift is a gift placed in service. Knowledge, discipline, and care for others: a message from the Consulate.',
        'Understanding begins where fear ends. Learn about psionic ability from those who study it, not those who fear its name.',
        'Each talent has a place in the common good. The Consulate grows stronger when ability is developed with care.',
        'Distance need not make strangers of us. Carry your greetings, your knowledge, and your goodwill to the next world.',
        'Knowledge is not a threat to harmony. Psionic study, responsibly pursued, is one of its foundations. A Consular civic message.',
        'To understand another is a responsibility as well as a privilege. Let patience guide the use of every talent.',
    ], 0.25),
];

/** Only these newly reviewed commercials are enabled, not the legacy advert corpus. */
export const broadcastAdvertIds: ReadonlySet<string> = new Set([...broadcastLines, ...nodLines].filter(l => l.category === 'advert').map(l => l.id));
