/**
 * Roll a passenger on a vessel (streams/D.md DT3b; backlog step T3b, Lane D's half). The roll is Lane
 * A's campaign/passengers.ts, which reads the rules file; this is how the result is said and kept.
 * Said as the backlog shows it: "34 · Causes Trouble · 5: Violent" (the entry's printed words up to
 * its bracket, then the second die and its outcome, or the rolled skills as "Mechanic 2, Engineer 0").
 * Kept as a person record (kind "passenger", name "Passenger" for the referee to type over, the printed
 * text with what was rolled as its summary), aboard the ship, linked to it as a passenger, and on its
 * passenger list with no class or fare. Nothing is read into the words. Pure: it runs under Node.
 */
import type { CampaignLink, CampaignRecord, PassengerLot } from '@voyage/shared';
import type { RolledPassenger } from '../campaign/passengers.ts';
import { newLink } from './links.ts';
import { newRecord } from './records.ts';

/** The entry's printed words before its bracket: "Causes Trouble (1–3: Drunkard, …)" reads "Causes Trouble". */
function head(text: string): string {
    const cut = text.indexOf(' (');
    return cut > 0 ? text.slice(0, cut) : text;
}

function skillWords(rolled: RolledPassenger): string {
    return rolled.skills ? rolled.skills.map((skill) => skill.name + ' ' + skill.level).join(', ') : '';
}

/** "34 · Causes Trouble · 5: Violent", "36 · Engineer · Mechanic 2, Engineer 0", "11 · Refugee – Political". */
export function rollWords(rolled: RolledPassenger): string {
    const parts = [rolled.roll, head(rolled.text)];
    // The second die is the third thrown: after the two of the D66.
    if (rolled.subText) parts.push(String(rolled.dice[2]) + ': ' + rolled.subText);
    const skills = skillWords(rolled);
    if (skills) parts.push(skills);
    return parts.join(' · ');
}

/** The kept person's summary: the printed text whole, then what was rolled. */
export function passengerSummary(rolled: RolledPassenger): string {
    return [rolled.text, rolled.subText ?? '', skillWords(rolled)].filter(Boolean).join(' · ');
}

export const PASSENGER_NAME = 'Passenger';

/** The person, the link to the ship and the ship's new passenger list, to commit as one change. */
export function keptPassenger(
    vessel: CampaignRecord,
    rolled: RolledPassenger,
    ids: { person: string; link: string },
    now: string,
): { person: CampaignRecord; link: CampaignLink; passengers: PassengerLot[] } {
    const person: CampaignRecord = {
        ...newRecord('person', ids.person, now, { kind: 'record', id: vessel.id }),
        kind: 'passenger',
        name: PASSENGER_NAME,
        summary: passengerSummary(rolled),
    };
    const link = newLink(ids.link, person.id, vessel.id, { kind: 'passenger', outward: true, label: 'Passenger on' }, '', now);
    const status = vessel.status && typeof vessel.status === 'object' ? vessel.status : {};
    const before = Array.isArray(status.passengers) ? status.passengers : [];
    return { person, link, passengers: [...before, { label: PASSENGER_NAME, class: '', personId: person.id }] };
}
