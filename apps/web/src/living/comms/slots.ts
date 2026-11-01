/**
 * Fill {world} and the other slots in a comms line.
 * The orbit traffic file keeps its own copy of this fill. Sharing this module
 * with traffic pulled the receiver, and the line pools, into the picture chunk.
 */
import type { SystemFacts } from '../facts.ts';

/** Fill the slots; null when one cannot be filled (the line then never plays). */
export function resolveSlots(text: string, f: SystemFacts, ships: readonly [string, string] | readonly string[]): string | null {
    let missing = false;
    const out = text.replace(/\{(\w+)\}/g, (_, slot: string) => {
        let value: string | undefined;
        switch (slot) {
            case 'world': value = f.name || f.hexKey; break;
            case 'port': value = f.name + (f.highport === true ? ' Highport' : ' Downport'); break;
            case 'starport': value = f.starport; break;
            case 'ship': value = ships[0]; break;
            case 'ship2': value = ships[1]; break;
            case 'sector': value = f.sector; break;
            case 'subsector': value = f.subsector; break;
            case 'date': value = `${String(f.day).padStart(3, '0')}-1105`; break;
            case 'gasGiant': case 'belt': case 'moon': case 'body': value = f.bodies[slot]; break;
        }
        if (!value) missing = true;
        return value ?? '';
    });
    return missing ? null : out;
}
