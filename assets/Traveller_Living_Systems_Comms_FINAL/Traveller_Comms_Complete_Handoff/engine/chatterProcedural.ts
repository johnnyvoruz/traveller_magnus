/**
 * Traveller system chatter: procedural scene prototype.
 * Intended to live beside facts.ts and chatter.ts. It does not modify the existing
 * ChatterFile schema or pretend a one-line ticker is a multi-party radio exchange.
 *
 * The caller renders turns one at a time, in order, and passes a recent-ID list
 * when requesting the next exchange. No network calls, language model, or runtime
 * randomness are required.
 */
import type { SystemFacts } from './facts.ts';

export type RadioRole = 'approach' | 'dock' | 'ship' | 'cargo' | 'customs' | 'security' |
    'operations' | 'beacon' | 'tug' | 'fuel' | 'dispatch';
export type RadioTurn = { speaker: string; text: string; quality?: 'clear' | 'weak' | 'broken' };
export type RadioEvent = {
    id: string;
    family: string;
    channel: string;
    turns: RadioTurn[];
    /** Lowest-impact chatter is easiest to let break up. */
    allowSignalNoise: boolean;
};
export type ChatterContext = {
    truthVersion: string;
    /** In-game day. Changes the traffic, not the station's personality. */
    day: number;
    eventIndex: number;
    /** Recently played scenario IDs, from this visit or previous visits. */
    avoidIds?: readonly string[];
};

type Rng = () => number;
type Scenario = {
    id: string;
    family: string;
    weight: number;
    when: (f: SystemFacts) => boolean;
    build: (f: SystemFacts, r: Rng, a: Actors) => RadioTurn[];
};
type Actors = { ship: string; other: string; tug: string; ctrl: string; ground: string; port: string };

function hash(input: string): number {
    let h = 2166136261;
    for (let i = 0; i < input.length; i++) {
        h = Math.imul(h ^ input.charCodeAt(i), 16777619);
    }
    return h >>> 0;
}
function rng(seed: number): Rng {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function one<T>(r: Rng, xs: readonly T[]): T { return xs[Math.floor(r() * xs.length)]!; }
function number(r: Rng, min: number, max: number): number { return Math.floor(r() * (max - min + 1)) + min; }
function allowed(f: SystemFacts, ...codes: string[]): boolean { return codes.some((x) => f.tradeCodes.includes(x)); }
function controlled(f: SystemFacts): boolean { return f.starport === 'A' || f.starport === 'B' || f.starport === 'C' || f.starport === 'D'; }
function inhabited(f: SystemFacts): boolean { return f.pop >= 1; }
function portStaffed(f: SystemFacts): boolean { return controlled(f) && inhabited(f); }
function surfaceAir(f: SystemFacts): boolean { return f.atm >= 2 && f.atm <= 9; }
function station(f: SystemFacts): string { return f.highport === true ? `${f.name} Highport` : `${f.name} Control`; }
function wordNum(n: number): string { return String(n).padStart(2, '0'); }

function actors(f: SystemFacts, truthVersion: string, r: Rng): Actors {
    // This pool is stable for this system and truth version; only the selected pair changes.
    const local = rng(hash(`${f.hexKey}|${truthVersion}|residents`));
    const bases = ['Lark', 'Second Wind', 'Tern', 'Odd Job', 'Morrow', 'Peregrine',
        'Eighth Day', 'Cassia', 'Blackcap', 'June', 'Nightingale', 'Leda',
        'Quiet Hours', 'Trinity', 'Kiln', 'Long Haul', 'Barley', 'Mica',
        'Road Home', 'Wayward', 'Nettle', 'Hannah', 'Common Cause', 'Gannet'];
    const residents: string[] = [];
    for (let i = 0; i < 12; i++) {
        residents.push(`${one(local, bases)} ${number(local, 2, 79)}`);
    }
    const first = number(r, 0, residents.length - 1);
    const second = (first + number(r, 1, residents.length - 1)) % residents.length;
    return {
        ship: residents[first]!, other: residents[second]!,
        tug: `Tug ${number(r, 2, 12)}`,
        ctrl: station(f), ground: `${f.name} Ground`, port: f.name,
    };
}
function turn(speaker: string, text: string, quality?: RadioTurn['quality']): RadioTurn {
    return quality ? { speaker, text, quality } : { speaker, text };
}
const yes = () => true;
const scenarios: Scenario[] = [
    // Approach and departure. These require staff, but don't assume a highport.
    { id: 'approach-clearance', family: 'approach', weight: 4, when: portStaffed, build: (_f, r, a) => [
        turn(a.ship, `${a.ctrl}, ${a.ship}. Request approach.`, 'clear'),
        turn(a.ctrl, `${a.ship}, report passing ten thousand. Expect vector on this frequency.`),
        turn(a.ship, `Passing ten thousand. Standing by.`),
    ] },
    { id: 'approach-slot', family: 'approach', weight: 4, when: portStaffed, build: (_f, r, a) => [
        turn(a.ctrl, `${a.ship}, arrival slot moved to ${wordNum(number(r, 12, 42))}. Keep the current approach.`),
        turn(a.ship, `We had ${wordNum(number(r, 5, 11))}.`),
        turn(a.ctrl, `You did. We've moved it.`),
    ] },
    { id: 'approach-speed', family: 'approach', weight: 3, when: portStaffed, build: (_f, r, a) => [
        turn(a.ctrl, `${a.other}, reduce closing rate to ${number(r, 1, 4)} hundred. You're overtaking the tug.`),
        turn(a.other, `Reducing. Had him below our scan.`),
        turn(a.ctrl, `He's not below it anymore.`),
    ] },
    { id: 'approach-ident', family: 'approach', weight: 4, when: portStaffed, build: (_f, r, a) => [
        turn(a.ctrl, `${a.ship}, confirm registration suffix ${number(r, 100, 999)}.`),
        turn(a.ship, `Negative. That's last week's charter. We're ${number(r, 100, 999)}.`),
        turn(a.ctrl, `Understood. Updating.`),
    ] },
    { id: 'approach-exit', family: 'approach', weight: 4, when: portStaffed, build: (_f, _r, a) => [
        turn(a.ship, `${a.ctrl}, ready to depart.`),
        turn(a.ctrl, `${a.ship}, hold. Outbound tanker has priority.`),
        turn(a.ship, `Holding.`),
    ] },
    { id: 'approach-flights', family: 'approach', weight: 3, when: portStaffed, build: (_f, r, a) => [
        turn(a.ctrl, `Flight check. All traffic between ${number(r, 1, 3)} and ${number(r, 4, 8)} thousand, identify.`),
        turn(a.ship, `${a.ship}, transient. Level at five.`),
        turn(a.ctrl, `${a.ship}, copied.`),
    ] },
    { id: 'approach-missed', family: 'approach', weight: 3, when: portStaffed, build: (_f, _r, a) => [
        turn(a.ship, `Request repeat on the last vector. Carrier broke up.`),
        turn(a.ctrl, `Maintain present heading. Do not turn yet.`),
        turn(a.ship, `Present heading.`),
    ] },
    { id: 'approach-passing', family: 'approach', weight: 3, when: portStaffed, build: (_f, r, a) => [
        turn(a.ctrl, `${a.ship}, traffic crossing above you. Range ${number(r, 2, 8)} thousand. No course change.`),
        turn(a.ship, `Traffic in sight. Holding course.`),
    ] },
    { id: 'approach-radio-check', family: 'approach', weight: 5, when: portStaffed, build: (_f, _r, a) => [
        turn(a.ship, `${a.ctrl}, radio check.`),
        turn(a.ctrl, `Reading you. A little thin.`),
        turn(a.ship, `That's this transmitter. Thanks.`),
    ] },
    { id: 'approach-frequency', family: 'approach', weight: 3, when: portStaffed, build: (_f, r, a) => [
        turn(a.ctrl, `${a.ship}, change to docking channel nine.`),
        turn(a.ship, `Docking nine. Good day.`),
    ] },
    // Highport events only with a known, positive highport fact.
    { id: 'highport-arm', family: 'dock', weight: 4, when: f => f.highport === true, build: (_f, _r, a) => [
        turn(a.ground, `${a.ship}, stay clear of the collar. Arm is still moving.`),
        turn(a.ship, `We see it.`),
        turn(a.ground, `Then keep the jets cold.`),
    ] },
    { id: 'highport-softseal', family: 'dock', weight: 4, when: f => f.highport === true, build: (_f, _r, a) => [
        turn(a.ground, `${a.ship}, soft seal confirmed. Hold on hard lock.`),
        turn(a.ship, `Copy. Pressure equalization in progress.`),
    ] },
    { id: 'highport-reassignment', family: 'dock', weight: 4, when: f => f.highport === true, build: (_f, r, a) => [
        turn(a.ground, `${a.ship}, switch berth ${number(r, 10, 59)} to ${number(r, 60, 95)}.`),
        turn(a.ship, `We've got a reefer connection on the first berth.`),
        turn(a.ground, `Second berth has one too. Just use the portside hookup.`),
    ] },
    { id: 'highport-tug', family: 'dock', weight: 4, when: f => f.highport === true, build: (_f, _r, a) => [
        turn(a.ground, `${a.tug}, you've got the wrong hull.`),
        turn(a.tug, `No, I don't.`),
        turn(a.ground, `Check the name again.`),
        turn(a.tug, `...Stand by.`),
    ] },
    { id: 'highport-vent', family: 'dock', weight: 3, when: f => f.highport === true, build: (_f, _r, a) => [
        turn(a.ship, `Dockside, confirm ventilation is running on the freight gallery.`),
        turn(a.ground, `Indicates green.`),
        turn(a.ship, `That's not what I asked.`),
        turn(a.ground, `I'll send someone.`),
    ] },
    { id: 'highport-queues', family: 'dock', weight: 4, when: f => f.highport === true, build: (_f, r, a) => [
        turn(a.ground, `Berths ${number(r, 2, 8)} through ${number(r, 12, 19)} are closed for service. Use the outer ring.`),
    ] },
    // C/D field and E frontier transmissions are much less formal.
    { id: 'field-gravel', family: 'ground', weight: 4, when: f => (f.starport === 'D' || f.starport === 'E') && inhabited(f), build: (f, _r, a) => [
        turn(a.ship, `${f.name} traffic, inbound from the east. Anybody using the main pad?`),
        turn('Local', `Not this minute. Stay off the west apron.`),
    ] },
    { id: 'field-light', family: 'ground', weight: 5, when: f => (f.starport === 'D' || f.starport === 'E') && inhabited(f), build: (f, _r, a) => [
        turn(a.ship, `${f.name} field, your approach marker's unlit.`),
        turn('Field', `Yes, we know. Follow the fence line.`),
    ] },
    { id: 'field-operator', family: 'ground', weight: 4, when: f => (f.starport === 'D' || f.starport === 'E') && inhabited(f), build: (f, _r, a) => [
        turn(a.ship, `${f.name}, who's running the field today?`),
        turn('Field', `Whoever answers this radio. State your business.`),
    ] },
    { id: 'field-pump', family: 'ground', weight: 4, when: f => f.starport === 'D', build: (_f, _r, a) => [
        turn(a.ship, `Ground, is the pump back up?`),
        turn('Field', `Number two is. The other one's still open.`),
        turn(a.ship, `We'll take number two.`),
    ] },
    { id: 'field-landing', family: 'ground', weight: 4, when: f => f.starport === 'E', build: (f, _r, a) => [
        turn(a.ship, `${f.name} traffic. Making one pass over the marker before we land.`),
        turn(a.ship, `No other traffic observed. Continuing descent.`),
    ] },
    { id: 'field-crosswind', family: 'ground', weight: 4, when: f => f.starport === 'E' && surfaceAir(f), build: (f, _r, a) => [
        turn(a.ship, `${f.name} traffic, crosswind on final. We'll make another circuit.`),
    ] },
    { id: 'field-pickup', family: 'ground', weight: 4, when: f => f.starport === 'E' && inhabited(f), build: (f, _r, a) => [
        turn(a.ship, `${f.name} local, can somebody move the ground truck off the marker?`),
        turn('Local', `Copy. Driver's on his way.`),
    ] },
    { id: 'noport-traffic', family: 'ground', weight: 4, when: f => f.starport === 'X', build: (f, _r, a) => [
        turn(a.ship, `${f.name} local traffic, crossing high above the primary. No surface approach planned.`),
    ] },
    { id: 'noport-cross', family: 'ground', weight: 3, when: f => f.starport === 'X', build: (f, r, a) => [
        turn(a.ship, `Uncontrolled traffic, ${a.ship} crossing ${f.name} orbit. Estimate ${number(r, 5, 20)} minutes to clear.`),
    ] },
    // Cargo and manifests: conversational pressure, but not adventure hooks.
    { id: 'freight-seal', family: 'cargo', weight: 5, when: f => controlled(f) && f.pop >= 2, build: (_f, _r, a) => [
        turn(a.ship, `Freight office, seal number on crate six doesn't match the manifest.`),
        turn('Freight', `Copy the actual number and I'll correct the entry.`),
        turn(a.ship, `Sending.`),
    ] },
    { id: 'freight-reefer', family: 'cargo', weight: 5, when: f => controlled(f) && f.pop >= 2, build: (_f, r, a) => [
        turn('Freight', `${a.ship}, who's paying power on your chilled containers?`),
        turn(a.ship, `Receiver. Account ends ${number(r, 1000, 9999)}.`),
        turn('Freight', `Got it.`),
    ] },
    { id: 'freight-mass', family: 'cargo', weight: 5, when: f => controlled(f) && f.pop >= 2, build: (_f, r, a) => {
        const listed = number(r, 40, 95);
        const weighed = listed + one(r, [-4, -3, -2, 2, 3, 4]);
        return [
            turn('Freight', `${a.ship}, bill of lading reads ${listed} tonnes. Scales say ${weighed}.`),
            turn(a.ship, `Use the scale. I'll send a corrected sheet.`),
        ];
    } },
    { id: 'freight-crane', family: 'cargo', weight: 4, when: f => controlled(f) && f.pop >= 2, build: (_f, _r, a) => [
        turn('Loading', `Crane two, hold that pallet. Forklift's still under it.`),
        turn('Crane Two', `Holding.`),
        turn('Loading', `All right. Clear now.`),
    ] },
    { id: 'freight-reassignment', family: 'cargo', weight: 5, when: f => controlled(f) && f.pop >= 3, build: (_f, _r, a) => [
        turn('Freight', `${a.ship}, where do you want the empty containers?`),
        turn(a.ship, `Where they were yesterday.`),
        turn('Freight', `That's become a fire lane.`),
        turn(a.ship, `Understood. Give us another place.`),
    ] },
    { id: 'freight-wait', family: 'cargo', weight: 5, when: f => controlled(f) && f.pop >= 2, build: (_f, _r, a) => [
        turn(a.ship, `Warehouse, confirming the load is ready?`),
        turn('Warehouse', `The paperwork is ready. Freight's still being weighed.`),
        turn(a.ship, `Copy. We'll hold on the ship.`),
    ] },
    { id: 'freight-duplicate', family: 'cargo', weight: 3, when: f => controlled(f) && f.pop >= 2, build: (_f, _r, a) => [
        turn('Freight', `${a.ship}, I've got two copies of the same declaration.`),
        turn(a.ship, `I only sent it once.`),
        turn('Freight', `All right, I'll take one out.`),
    ] },
    { id: 'agri-pallet', family: 'cargo', weight: 5, when: f => allowed(f, 'Ag', 'Pa') && controlled(f), build: (_f, _r, a) => [
        turn('Cold Storage', `Freight three, keep the produce under power until the haulier arrives.`),
        turn('Freight Three', `Copy. Leaving refrigeration on.`),
    ] },
    { id: 'industrial-shift', family: 'cargo', weight: 4, when: f => allowed(f, 'In', 'Pi') && controlled(f), build: (_f, _r, _a) => [
        turn('Plant Dispatch', `Transfer unit seven, check your straps before leaving the loading bay.`),
        turn('Unit Seven', `Straps checked. All green.`),
    ] },
    { id: 'belt-tow', family: 'cargo', weight: 4, when: f => f.belts > 0 || allowed(f, 'As'), build: (f, _r, a) => [
        turn(a.ship, `${f.name} belt traffic, ${a.ship}. Moving a loaded ore barge through the working lane.`),
        turn(a.other, `Copy. Holding outside your track.`),
    ] },
    // Local law: procedural specificity, no invented list of prohibited items.
    { id: 'customs-headcount', family: 'customs', weight: 4, when: f => portStaffed(f) && f.law >= 3, build: (_f, _r, a) => [
        turn('Customs', `${a.ship}, state your crew count again.`),
        turn(a.ship, `Five aboard. Four working, one passenger.`),
        turn('Customs', `Copy five.`),
    ] },
    { id: 'customs-manifest', family: 'customs', weight: 5, when: f => portStaffed(f) && f.law >= 2, build: (_f, _r, a) => [
        turn('Customs', `${a.ship}, page three is missing from the cargo filing.`),
        turn(a.ship, `I can resend the packet.`),
        turn('Customs', `Just page three, please.`),
    ] },
    { id: 'customs-departure', family: 'customs', weight: 4, when: f => portStaffed(f) && f.law >= 5, build: (_f, _r, a) => [
        turn('Inspection', `${a.ship}, hold the gangway. We haven't finished clearance.`),
        turn(a.ship, `Gangway holding.`),
    ] },
    { id: 'security-identity', family: 'security', weight: 4, when: f => portStaffed(f) && f.law >= 7, build: (_f, _r, a) => [
        turn('Security', `${a.ship}, confirm captain and operating company.`),
        turn(a.ship, `Captain recorded on the filing. Independent operator.`),
        turn('Security', `Received.`),
    ] },
    { id: 'security-permit', family: 'security', weight: 4, when: f => portStaffed(f) && f.law >= 9, build: (_f, _r, a) => [
        turn('Transit Office', `${a.ship}, surface travel permit is not attached to your arrival packet.`),
        turn(a.ship, `We're not going surface-side.`),
        turn('Transit Office', `Acknowledged. Record marked transit only.`),
    ] },
    { id: 'security-repeat', family: 'security', weight: 3, when: f => portStaffed(f) && f.law >= 10, build: (_f, _r, a) => [
        turn('Access Control', `${a.ship}, read your permit number clearly. No abbreviations.`),
        turn(a.ship, `Repeating the number now.`),
    ] },
    { id: 'corporate-billing', family: 'customs', weight: 4, when: f => portStaffed(f) && f.gov === 1, build: (_f, _r, a) => [
        turn('Port Accounts', `${a.ship}, the berth charge is posted. Confirm your billing contact.`),
        turn(a.ship, `Same account as last call.`),
        turn('Port Accounts', `We still need you to confirm it.`),
    ] },
    { id: 'bureaucracy-reference', family: 'customs', weight: 4, when: f => portStaffed(f) && (f.gov === 8 || f.gov === 9), build: (_f, r, a) => [
        turn('Records', `${a.ship}, quote reference ${number(r, 100, 999)} when you call the desk.`),
        turn(a.ship, `Copy reference. Is that also the landing number?`),
        turn('Records', `No. Separate number.`),
    ] },
    // Systems traffic, ordinary work, and small delays.
    { id: 'fuel-purity', family: 'fuel', weight: 4, when: f => (f.starport === 'A' || f.starport === 'B') && (inhabited(f) || f.highport === true), build: (_f, _r, a) => [
        turn(a.ship, `Fuel desk, requesting test certificate with the final delivery.`),
        turn('Fuel Desk', `On the invoice. Same place it always is.`),
        turn(a.ship, `Understood. Thanks.`),
    ] },
    { id: 'fuel-pump', family: 'fuel', weight: 5, when: f => (f.starport === 'A' || f.starport === 'B' || f.starport === 'C') && (inhabited(f) || f.highport === true), build: (_f, _r, a) => [
        turn('Fuel Desk', `Pump four, hold pressure until I confirm the coupling.`),
        turn('Pump Four', `Holding.`),
        turn('Fuel Desk', `All right. Bring it up slow.`),
    ] },
    { id: 'gasgiant-traffic', family: 'fuel', weight: 4, when: f => f.gasGiants > 0, build: (_f, _r, a) => [
        turn(a.ship, `Skim traffic, ${a.ship} leaving the collection track. Clear to your aft.`),
        turn(a.other, `Copy. Taking the next pass.`),
    ] },
    { id: 'gasgiant-skimmer-check', family: 'fuel', weight: 4, when: f => f.gasGiants > 0, build: (_f, _r, a) => [
        turn(a.other, `Skimmer Seven, check your separator reading before the second pass.`),
        turn('Skimmer Seven', `Reading normal. Sending the numbers.`),
    ] },
    { id: 'dispatch-hold', family: 'dispatch', weight: 4, when: yes, build: (_f, _r, a) => [
        turn(a.ship, `${a.other}, we've cleared your stern. You can turn now.`),
        turn(a.other, `Copy, turning.`),
    ] },
    { id: 'dispatch-clock', family: 'dispatch', weight: 5, when: yes, build: (_f, _r, a) => [
        turn(a.ship, `${a.other}, were you on the last traffic update?`),
        turn(a.other, `Negative. Send it again.`),
        turn(a.ship, `Copy. Relaying.`),
    ] },
    { id: 'dispatch-clear', family: 'dispatch', weight: 4, when: yes, build: (_f, _r, a) => [
        turn(a.ship, `Any vessel on the common channel, radio check.`),
        turn(a.other, `Reading you, ${a.ship}.`),
        turn(a.ship, `Thanks. That's all.`),
    ] },
    { id: 'dispatch-location', family: 'dispatch', weight: 4, when: f => f.otherBodies > 0, build: (f, _r, a) => [
        turn(a.ship, `Traffic near ${f.bodies.body || 'the outer worlds'}, ${a.ship}. Crossing the transfer lane outbound.`),
    ] },
    { id: 'comms-narrow', family: 'technical', weight: 5, when: yes, build: (_f, _r, a) => [
        turn(a.ship, `${a.other}, you're cutting out. Shift to narrowband.`),
        turn(a.other, `Narrowband now. Better?`, 'weak'),
        turn(a.ship, `Better.`),
    ] },
    { id: 'comms-antenna', family: 'technical', weight: 4, when: yes, build: (_f, _r, a) => [
        turn(a.other, `${a.ship}, your return signal is low.`),
        turn(a.ship, `We're rolling to clear the antenna. One moment.`),
    ] },
    { id: 'technical-test', family: 'technical', weight: 4, when: f => controlled(f) && inhabited(f), build: (_f, _r, _a) => [
        turn('Maintenance', `Dock power, this is a test. Acknowledge on receipt.`),
        turn('Dock Power', `Received. No faults.`),
    ] },
    { id: 'technical-airlock', family: 'technical', weight: 4, when: f => f.atm <= 1 && f.starport !== 'X' && inhabited(f), build: (_f, _r, a) => [
        turn(a.ship, `Ground, outer hatch is shut. Starting pressure cycle.`),
        turn(a.ground, `Copy. Keep the service door latched.`),
    ] },
    { id: 'technical-suits', family: 'technical', weight: 4, when: f => f.atm <= 1 && inhabited(f), build: (_f, _r, a) => [
        turn('Surface Crew', `Team four, repeat oxygen check before leaving the lock.`),
        turn('Team Four', `Confirmed. All members green.`),
    ] },
    { id: 'technical-automation', family: 'technical', weight: 3, when: f => f.tl >= 12 && f.starport !== 'X', build: (_f, _r, a) => [
        turn('Dock System', `${a.ship}, berthing receipt transmitted. Reply only for a correction.`),
        turn(a.ship, `No correction.`),
    ] },
    { id: 'technical-manual', family: 'technical', weight: 3, when: f => f.tl <= 7 && inhabited(f) && controlled(f), build: (_f, _r, a) => [
        turn('Field Office', `${a.ship}, our terminal's down. Read the booking number to me.`),
        turn(a.ship, `Stand by. It's on the second sheet.`),
    ] },
    { id: 'technical-maintenance-slot', family: 'technical', weight: 4, when: f => (f.starport === 'A' || f.starport === 'B') && (inhabited(f) || f.highport === true), build: (_f, _r, a) => [
        turn('Yard Services', `${a.ship}, you'll need to clear the engine room for the inspection.`),
        turn(a.ship, `We can do that after shift change.`),
        turn('Yard Services', `Copy. Marking late watch.`),
    ] },
    { id: 'marine-weather', family: 'environment', weight: 4, when: f => f.hydro >= 9 && surfaceAir(f) && inhabited(f) && controlled(f), build: (_f, _r, _a) => [
        turn('Surface Traffic', `Harbour transfer is running behind. Swell's up near the south platform.`),
    ] },
    { id: 'air-weather', family: 'environment', weight: 4, when: f => surfaceAir(f) && inhabited(f) && controlled(f), build: (_f, _r, a) => [
        turn(a.ground, `Surface inbound, wind has shifted. Confirm you're using the revised approach.`),
        turn(a.ship, `Confirmed. Revised approach.`),
    ] },
    { id: 'dust-weather', family: 'environment', weight: 4, when: f => allowed(f, 'De') && surfaceAir(f) && inhabited(f) && controlled(f), build: (_f, _r, _a) => [
        turn('Field Weather', `Dust now crossing the north approach. Ground visibility is reduced.`),
    ] },
    { id: 'ice-maintenance', family: 'environment', weight: 4, when: f => allowed(f, 'Ic', 'Fr') && controlled(f) && inhabited(f), build: (_f, _r, _a) => [
        turn('Pad Maintenance', `De-ice unit returning to storage. Approach markers are clear.`),
    ] },
    { id: 'xboat-transfer', family: 'dispatch', weight: 3, when: f => f.xboat && inhabited(f), build: (_f, _r, a) => [
        turn('Dispatch', `Packet transfer complete. ${a.ship}, receipt is waiting in your queue.`),
        turn(a.ship, `Confirmed. We'll collect after docking.`),
    ] },
    { id: 'scout-flight', family: 'dispatch', weight: 3, when: f => f.bases.includes('S') && f.starport !== 'X', build: (_f, _r, a) => [
        turn('Scout Operations', `${a.ship}, report in when you're clear of base traffic.`),
        turn(a.ship, `Will do.`),
    ] },
    { id: 'naval-priority', family: 'approach', weight: 3, when: f => f.bases.includes('N') && portStaffed(f), build: (_f, _r, a) => [
        turn(a.ctrl, `${a.ship}, maintain your hold. Base movement crossing your approach.`),
        turn(a.ship, `Holding. Can we get an estimate?`),
        turn(a.ctrl, `Not yet.`),
    ] },
    { id: 'communal-landing', family: 'ground', weight: 3, when: f => f.gov === 0 && inhabited(f) && (f.starport === 'D' || f.starport === 'E'), build: (f, _r, a) => [
        turn(a.ship, `${f.name} traffic, planning to set down on the marked pad.`),
        turn('Local', `Copy. Leave enough room for the supply lander.`),
    ] },
];

/** Stable sign-on traffic; invoke once per visit/arrival, not every few seconds. */
export function welcomeFor(f: SystemFacts, truthVersion: string): RadioEvent | null {
    if (f.party === 'away' || f.party === 'inJump' || f.starport === 'X') return null;
    const r = rng(hash(`${f.hexKey}|${truthVersion}|welcome`));
    const frequency = number(r, 2, 12);
    let message: string;
    if (f.starport === 'E') {
        message = `${f.name} landing marker. No positive traffic control. Announce intentions on common.`;
    } else if (f.pop === 0 && f.highport !== true) {
        message = `${f.name} approach marker. Unattended-channel advisory. Broadcast your position and intentions on common.`;
    } else if (f.highport === true) {
        message = `Welcome to ${f.name}. Highport arrivals, contact approach on channel ${frequency}. Surface-bound traffic use the published descent corridor.`;
    } else {
        message = `Welcome to ${f.name}. Arrivals call ${f.name} approach on channel ${frequency}. Have your vessel registration ready.`;
    }
    if (f.law >= 9 && inhabited(f) && f.starport !== 'E') {
        message += ` Surface transit credentials may be requested before departure from the port.`;
    } else if (f.gov === 1 && inhabited(f) && f.starport !== 'E') {
        message += ` Berth charges are processed through port accounts.`;
    }
    return { id: `welcome:${f.hexKey}:${truthVersion}`, family: 'beacon', channel: 'traffic-advisory',
        turns: [turn(`${f.name} Beacon`, message)], allowSignalNoise: false };
}

/**
 * Pick one coherent event. Returns null if the party has no local radio access.
 * eventIndex is a monotonically increasing *request number* for this system/day.
 * Caller should save recent event IDs per system across navigation, unlike the
 * existing in-memory visit-only cursor.
 */
export function nextProceduralEvent(f: SystemFacts, ctx: ChatterContext): RadioEvent | null {
    if (f.party === 'away' || f.party === 'inJump') return null;
    const r = rng(hash(`${f.hexKey}|${ctx.truthVersion}|${ctx.day}|${ctx.eventIndex}`));
    let pool = scenarios.filter((s) => s.when(f));
    if (!pool.length) return null;
    const avoid = new Set(ctx.avoidIds ?? []);
    const unseen = pool.filter(s => !avoid.has(s.id));
    if (!unseen.length) return null; // Preserve quiet rather than replay an exhausted pool.
    pool = unseen;
    // First draw a radio family; otherwise a family with more scripted variants
    // accidentally dominates the airwaves. The second draw selects a scenario.
    const familyWeight: Record<string, number> = {
        approach: 30, dock: 15, ground: 12, cargo: 22, customs: 9,
        security: f.law >= 9 ? 11 : 4, fuel: 9, dispatch: 12,
        technical: 12, environment: 7,
    };
    const families = [...new Set(pool.map(s => s.family))];
    let familyTicket = r() * families.reduce((sum, name) => sum + (familyWeight[name] ?? 5), 0);
    let family = families[families.length - 1]!;
    for (const name of families) {
        familyTicket -= familyWeight[name] ?? 5;
        if (familyTicket < 0) { family = name; break; }
    }
    pool = pool.filter(s => s.family === family);
    const sum = pool.reduce((acc, item) => acc + item.weight, 0);
    let ticket = r() * sum;
    let selected = pool[pool.length - 1]!;
    for (const scenario of pool) { ticket -= scenario.weight; if (ticket < 0) { selected = scenario; break; } }
    const people = actors(f, ctx.truthVersion, r);
    let turns = selected.build(f, r, people);
    // Only low-consequence speech is allowed to break up. Keep original words,
    // signal status, and the other turns intact. Never garble a safety clearance.
    const canBeNoisy = ['cargo', 'dispatch', 'ground', 'technical'].includes(selected.family);
    if (canBeNoisy && r() < 0.035 && turns.length > 0) {
        const idx = turns.length - 1;
        turns = turns.map((part, i) => i === idx ? { ...part, quality: 'weak' as const } : part);
    }
    return {
        id: selected.id, family: selected.family,
        channel: selected.family === 'approach' ? 'approach'
            : selected.family === 'dock' ? 'dockside'
            : selected.family === 'customs' || selected.family === 'security' ? 'services'
            : 'common',
        turns, allowSignalNoise: canBeNoisy,
    };
}

/** Category-agnostic cadence proposal in seconds; tune after actual UI testing. */
export function suggestedGapSeconds(f: SystemFacts, truthVersion: string, day: number, eventIndex: number): number {
    const r = rng(hash(`${f.hexKey}|${truthVersion}|${day}|gap|${eventIndex}`));
    const busy = (f.starport === 'A' || f.starport === 'B') && f.pop >= 7;
    const quiet = f.starport === 'X' || f.pop <= 2;
    const min = busy ? 15 : quiet ? 125 : 40;
    const max = busy ? 45 : quiet ? 360 : 115;
    return number(r, min, max);
}

export function scenarioCount(f: SystemFacts): number { return scenarios.filter((s) => s.when(f)).length; }
