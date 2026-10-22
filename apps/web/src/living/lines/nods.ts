/** Original, understated genre nods. No named crossover characters, ships or events.
 * These remain ambient Traveller broadcasts; reduced weights keep the jokes occasional.
 * Recruitment is public copy, not a promise of mechanical benefits or citizenship rules.
 */
import { ChatterLine, type ChatterLineData, type ChatterWhenData } from '@voyage/shared';

export const nodSources = new Map<string, { speaker: string; channel: 'common' | 'services' }>();

function group(category: 'advert' | 'ship', start: number, when: ChatterWhenData,
    texts: string[], speaker?: string): ChatterLineData[] {
    return texts.map((text, i) => {
        const id = `${category}-${start + i}`;
        if (speaker) nodSources.set(id, { speaker, channel: 'common' });
        return ChatterLine.parse({ id, category, voice: category === 'advert' ? 'advert' : 'crew', text,
            weight: category === 'advert' ? 0.25 : 0.5,
            when: { pop: { min: 1 }, ...when },
        });
    });
}

export const nodLines: ChatterLineData[] = [
    // Public-service recruitment reels, with the user's requested refrain.
    ...group('advert', 230, { allegiance: ['Im'], bases: ['N'], starport: ['A', 'B', 'C', 'D'] }, [
        'A thousand worlds need more than spectators. Imperial naval careers: engineering, medicine, flight operations. Would you like to know more?',
        'Your future could have a different sunrise every posting. Ask Imperial naval recruitment about service beyond your homeworld. Would you like to know more?',
        'The uniform looks splendid in the recruitment reel. The people keeping its wearer alive have technical qualifications. Ask about Imperial naval support careers.',
        'Imperial naval recruitment thanks the volunteer demonstrators. The training suit is available for photographs after its operator has worked out how to kneel.',
        'Curiosity took us to the stars. Training helps us come home. Explore Imperial naval technical careers. Would you like to know more?',
        'Our recruitment presentation now includes questions from serving personnel. The catering section has proved unexpectedly popular.',
    ], 'Imperial Careers'),
    // Independent traders: affection for a battered ship, freedom, small comforts.
    ...group('ship', 500, { starport: ['C', 'D', 'E'] }, [
        'She is not much to look at from the docking camera. Try the view from the pilot\'s seat when the bills are paid and nobody owns your next destination.',
        'The cargo is legitimate, the passenger list is accurate, and the captain would appreciate everyone sounding less surprised about both.',
        'We have fresh fruit aboard. The engineer has asked that nobody eat the last red berry until she has finished admiring it.',
        'Our mechanic says the engine needs one new coupling and a little affection. We have ordered the coupling; the captain is handling the rest.',
        'We took the small job, got paid, and kept the ship flying. The crew has declared that sufficient grounds for a very good dinner.',
        'The coat stays with the captain, the spare parts stay with the ship, and the live cargo stays out of the passenger cabins. That is the whole loading brief.',
    ]),
    // Fleet solidarity, older equipment and an overly enthusiastic wardroom.
    ...group('ship', 506, { bases: ['N'], starport: ['A', 'B', 'C', 'D'] }, [
        'The wardroom has acknowledged the toast. All of them, individually, at full volume. Please keep the common channel clear for the next speaker.',
        'Our oldest training launch has physical switches all the way across the panel. The cadets call it obsolete. The instructor calls it understandable.',
        'Flight instructor to the service desk. Please leave the trainee\'s new nickname off the maintenance record. It was one landing.',
        'The exercise is complete and every launch is accounted for. The duty officer has requested that someone tell the musicians they can stop building suspense.',
        'Our tactical display is being used for the interdepartmental sports final. For once the entire watch agrees on what the symbols mean.',
        'Supply tender here. The ceremonial toast has been added to the meal recording. There is a brief pause while the admiral remembers which microphone is live.',
    ]),
    // Customs, astrogation, service robots and a pilot with a very flexible reputation.
    ...group('ship', 512, { starport: ['A', 'B', 'C', 'D'] }, [
        'Customs, the little service robots are on the manifest. Waving your hand over the list will not make the serial numbers match, captain.',
        'Our pilot has submitted another impressive route time in units of distance. Astrogation is preparing a patient reply.',
        'The astrogator has the probabilities. The captain has asked for the recommended action first and the depressing decimal places afterward.',
        'The maintenance robot has finished complaining about the job and has now completed it perfectly. We are keeping both entries in its service log.',
        'Our navigator would like the targeting reticle removed from the docking simulator. She says it encourages entirely the wrong attitude toward the berth.',
        'The cargo handler reports an excellent feeling about this delivery. We have asked him to record it; he usually announces the opposite.',
    ]),
    // A few wider genre echoes, all resolved as mundane shipboard business.
    ...group('ship', 518, { starport: ['A', 'B', 'C', 'D'] }, [
        'The ship computer declined to open the galley dispenser until its cleaning cycle finished. The captain is taking the refusal rather personally.',
        'Personal kit check complete. Our senior Scout insists a towel belongs beside the emergency beacon. Nobody has yet proved him wrong.',
        'The cargo-lifter suit demonstration is complete. Excellent handling. Please do not wear it into the galley merely because the serving trays are heavy.',
        'The survey team has found an exceptionally rectangular rock. Geology requests measurements before anyone selects dramatic music.',
        'The synthetic crewmember has passed the routine interview. He would like someone to ask the captain equally searching questions about his dreams.',
        'Shipboard gardening report: the solitary potato plant has produced a second leaf. The science officer is presenting the news with considerable dignity.',
    ]),
];
