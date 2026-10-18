/** Fifty additional ambient transmissions. Existing lines and weights stay intact.
 * Jump/passage context: rules/mgt2e_space_travel.json and rules/mgt2e_trade.json.
 * No mechanical bonuses, fixed transit promises, live interstellar radio or hooks.
 * Alien callers are individual visiting crew, not an inference about local species.
 */
import { ChatterLine, type ChatterLineData, type ChatterWhenData } from '@voyage/shared';

function group(start: number, when: ChatterWhenData, texts: string[]): ChatterLineData[] {
    return texts.map((text, i) => ChatterLine.parse({
        id: `ship-${start + i}`, category: 'ship', voice: 'crew', text,
        when: { pop: { min: 1 }, ...when },
    }));
}

export const travellerLines: ChatterLineData[] = [
    ...group(450, {}, [
        'Jump emergence confirmed. Star fix agrees with the plot. Our newest passenger is staring at the forward screen like we have invented the universe.',
        'Departure packet is aboard. We will carry your reply on the next leg. Once we jump, even the captain\'s mother will have to wait.',
        'First meal after jump, and the whole crew has chosen seats facing the exterior feed. Same table, entirely different stars.',
        'Astrogation has signed the next plot. We are sending our last personal messages before departure. The quiet after that belongs to us.',
        'Our engineer has finished listening to the jump drive cool down. Instruments say normal. She says it sounds pleased with itself.',
    ]),
    ...group(455, { starport: ['A', 'B', 'C', 'D'] }, [
        'Free trader to the broker desk. A hold full of machine parts coming in, woven cloth going out. The ship smells different every time we open the hatch.',
        'The mortgage payment is in the outgoing bank packet. Our captain has pinned the receipt beside the ship portrait. Another small piece of her is ours.',
        'Broker, we have inspected the samples. The colour is extraordinary. Send the maker\'s name with the consignment; our buyer will want to know who made it.',
        'We sold the last of the previous cargo. The empty hold echoes like a concert hall. Our steward has discovered this and is making full use of it.',
        'Local exchange, the return freight is booked. We will be back when the route brings us round. Save our old berth number if you can.',
    ]),
    ...group(460, { starport: ['A', 'B', 'C', 'D'] }, [
        'Passenger launch, our low-berth arrivals have completed their medical handover. Their family is waiting with fresh clothes and an unreasonable number of flowers.',
        'High-passage baggage is ready for collection. The passenger brought formalwear for three worlds. None of the shoes are suitable for a boarding ladder.',
        'Our middle-passage passenger has finished teaching the crew her card game. She has also paid for most of her next ticket. We suspect a connection.',
        'Steward to reception. The emigrating family has its landing papers ready. Their youngest would like to know which star is home now.',
        'Our passenger has crossed six systems to meet her grandson. She has asked us to stop calling it a routine arrival.',
    ]),
    ...group(465, { xboat: true }, [
        'X-boat mail copies received. The captain\'s son has sent a recording of his first solo flight. Departure checks may take a little longer than usual.',
        'Dispatch, keep the original sending date on that letter. It has followed us through four ports. Whoever wrote it has been very patient.',
        'The latest X-boat packet has the ending of our drama serial. The crew has negotiated a spoiler-free corridor between the bridge and the galley.',
        'Mail handover complete. One packet of market figures, two family albums, and a choir recording that made the steward sit down quietly.',
        'The reply for our home port is sealed. We included a picture of this sky. The people receiving it will never have seen these constellations.',
    ]),
    ...group(470, { bases: ['S'], starport: ['A', 'B', 'C', 'D'] }, [
        'Scout base, the survey archive is ready. We have corrected the coastline, the mineral estimate, and the spelling of the mountain we slept under.',
        'Retired Scout requesting the service desk. The ship and I are both still flying. Only one of us needs the replacement seal.',
        'Scout survey crew to base archive. The first image is the official panorama. The second is all of us standing very small beneath it.',
        'Base cartography, the old landing coordinates were accurate. The settlement has moved. We brought back a new fix and their forwarding address.',
        'Scout stores, the field recorder is returned with the expedition kit. Keep the dawn audio. There are sounds on that world we still cannot put names to.',
    ]),
    ...group(475, { gasGiants: { min: 1 } }, [
        'Fuel scoop inspection complete. The giant is still on the aft camera, filling half the sky. We are giving the new crew one last look before changing attitude.',
        'Skimming run logged, processor cycling. The captain calls it free fuel. Engineering has submitted a slightly longer description.',
        'Gas giant survey team, your false-colour image is on the lounge wall. The passengers think it is art. We told them it can be both.',
        'Our gas giant probe has finished its transmission. We have its pressure record, its last cloud image, and a round of applause from the science deck.',
        'The sampling run found the predicted spectral line. Three months of modelling, and there it is in the recorder. We are opening the good tea.',
    ]),
    ...group(480, { belts: { min: 1 } }, [
        'Belt survey complete for this pass. We have given the worksite a name. Coordinates for navigation, name for the people who have to live there.',
        'Prospecting crew here. The assay paid for the trip. Anything after this goes toward a better grav couch for the person who found it.',
        'Sample cradle secured. The oldest thing aboard is now a piece of stone, and our engineer has graciously surrendered the title.',
        'The work drone has mapped the whole rock, including the shelter we bolted to it. From that angle, home looks very small and very determined.',
        'Our belt-work crew is ready for the passenger launch. One of them has asked if the port has a garden. A real one, with room to walk.',
    ]),
    ...group(485, { allegiance: ['Im'], starport: ['A', 'B', 'C', 'D'] }, [
        'The duke\'s courier has the provincial accounts aboard. We are sharing the departure queue with a fruit carrier. The Imperium needs both.',
        'Our passenger is a newly appointed knight returning home. Her old crew has put the welcome message on every cabin display.',
        'Imperial archive transfer acknowledged. The surveyors have asked that the local names remain beside the chart designations.',
        'The countess has sent her engineer to inspect the proposed irrigation works. The ceremonial party is arriving later, once there is something worth opening.',
        'Our ceremonial delivery includes a repaired Imperial standard. The household asked us to preserve the old stitching. It has travelled farther than the current bearer.',
    ]),
    ...group(490, { allegiance: ['As'], starport: ['A', 'B', 'C', 'D'] }, [
        'The clan representative has accepted the cargo figures. She has also corrected our translator. We would like to keep both sets of amendments.',
        'Our hosts have sent a recording of the departure blessing. The crew is learning the response before our next visit.',
        'Clan trade delegation aboard. The negotiator has the contracts; her companion has the family gifts. Please keep the two inventories separate.',
        'The Aslan visitors have approved the seating adaptations. Our steward has asked permission to keep the measurements for the next crew.',
        'We have returned the borrowed ceremonial case to the host household. It came aboard empty and is going back full of the crew\'s small thank-you gifts.',
    ]),
    ...group(495, { starport: ['A', 'B', 'C', 'D'] }, [
        'Our Vargr engineer and your human technician have agreed on the repair. They are still discussing the best music to work to. We may be here a while.',
        'Visiting Aslan passenger requests a copy of the starfield recording. She would like her family to see the route as she saw it.',
        'The translator has finally learned everyone\'s name aboard. We celebrated by teaching it the nicknames. It has requested more context.',
        'The galley has three menus, two atmosphere-sealed serving hatches, and one table booking. Nobody wanted to eat the welcome meal alone.',
        'Passenger exchange complete. Six homeworlds in one launch, all trying to photograph the same sunrise. The pilot has offered to send them a clear copy.',
    ]),
];
