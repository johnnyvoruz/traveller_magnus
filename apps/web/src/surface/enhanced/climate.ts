/**
 * The enhanced look's climate and sea, from the corrected fields when a body has them.
 * Absent fields, and a surface band whose status is unknown, leave today's profile.
 * Vanilla never calls this.
 */
import { surfaceProfile, type ProfileLook } from '../profile.ts';
type Body = Record<string, any>;

function statusOf(value: unknown): string | null {
    if (!value || typeof value !== 'object') return null;
    const status = (value as { status?: unknown }).status;
    return typeof status === 'string' ? status : null;
}

/** The classifier's climate word, or null when the field is absent or not known. */
export function knownSurfaceWord(body: Body | null | undefined): string | null {
    if (!body) return null;
    const field = body.surfaceTempBand;
    if (statusOf(field) !== 'known') return null;
    const band = (field as { band?: unknown }).band;
    return typeof band === 'string' && band !== '' ? band : null;
}

/**
 * How the enhanced sea treats a 1.2.0 liquid. 'none' is no free liquid: liquidType null,
 * or a status of none, unresolved or unknown. An absent liquidType (the 1.1.0 shape) is
 * 'data', and the profile infers a sea the way it does today.
 */
export function liquidLook(body: Body | null | undefined): ProfileLook['sea'] {
    if (body && body.liquidType === null) return 'none';
    const status = body ? statusOf(body.liquidStatus) : null;
    if (status === 'none' || status === 'unresolved' || status === 'unknown') return 'none';
    return 'data';
}

/**
 * The enhanced disc profile. With no corrected climate word and no liquid status
 * that changes the sea, this is surfaceProfile's own object.
 */
export function enhancedProfile(body: Body, id: string): Body {
    const band = knownSurfaceWord(body);
    const sea = liquidLook(body);
    if (!band && sea === 'data') return weathered(surfaceProfile(body, id));
    const look: ProfileLook = { band, sea };
    return weathered(surfaceProfile(body, id, look));
}

const weatheredOf = new WeakMap<object, Body>();

/** How far a world's weather may sit from the figure its air and seas give: 0.5 to 1.5 times it. */
export const CLOUD_SPREAD = 0.5;

/** Casts a gas giant's bands may lean toward: warm, cool, pale gold, mauve, olive. */
const GAS_CASTS: readonly (readonly number[])[] = [[226, 168, 120], [150, 190, 214], [214, 206, 150], [176, 132, 150], [140, 170, 130]];

const blend = (a: readonly number[], b: readonly number[], t: number): number[] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * The same profile made this world's own, from its seed (Johnny, 2026-11-14: worlds of one kind "feel so
 * same-y"; "related but not exact copies"). Three cheap things, none of them a new field or a new pass:
 *   weather: the cloud cover sits from half to one and a half times the figure the air and seas give. A
 *     full deck (corrosive, insidious or boiling, 0.8 and over) stays full; a clear sky stays clear;
 *   rock: the bare ground's two tones lean a little warm or cool, light or dark;
 *   a gas giant: more or fewer bands, its colours leaning toward one of five casts, belts nearer to or
 *     further from the zones, a storm of its own size.
 * The draw program adds a small cast of tone from the same seed (enhanced/draw.ts). One object per
 * profile, so everything keyed on the profile sees one world. Presentation only: no rule is read or made.
 */
export function weathered(profile: Body): Body {
    if (!profile || typeof profile !== 'object') return profile;
    const hit = weatheredOf.get(profile);
    if (hit) return hit;
    let h = (Number(profile.seed) >>> 0) ^ 0x9e3779b9;
    const roll = (): number => {
        h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
        h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
        h = (h ^ (h >>> 16)) >>> 0;
        return h / 4294967296;
    };
    const out: Body = { ...profile };
    const cover = profile.clouds ? Number(profile.clouds.cover) : 0;
    const sky = roll();
    if (cover > 0.001 && cover < 0.8) {
        out.clouds = { ...profile.clouds, cover: Math.max(0.04, Math.min(0.78, cover * (1 - CLOUD_SPREAD + 2 * CLOUD_SPREAD * sky))) };
    }
    const warm = roll() - 0.5;
    const tone = roll() - 0.5;
    if (profile.rock && Array.isArray(profile.rock.low) && Array.isArray(profile.rock.high)) {
        const lean = [1 + warm * 0.22 + tone * 0.16, 1 + tone * 0.16, 1 - warm * 0.22 + tone * 0.16];
        const cast = (rgb: readonly number[]): number[] => rgb.map((v, i) => Math.max(0, Math.min(255, v * lean[i])));
        out.rock = { ...profile.rock, low: cast(profile.rock.low), high: cast(profile.rock.high) };
    }
    if (profile.gas && typeof profile.gas === 'object') {
        const toward = GAS_CASTS[Math.floor(roll() * GAS_CASTS.length) % GAS_CASTS.length];
        const lean = 0.08 + roll() * 0.3;
        const apart = (roll() - 0.5) * 0.5;
        const gas: Record<string, unknown> = { ...profile.gas };
        for (const key of ['zone', 'belt', 'pole', 'storm']) {
            if (Array.isArray(profile.gas[key])) gas[key] = blend(profile.gas[key], toward, key === 'storm' ? lean * 0.5 : lean);
        }
        // Belts nearer to the zones (a pale, quiet giant) or further from them (a strongly banded one).
        if (Array.isArray(gas.belt) && Array.isArray(gas.zone)) {
            gas.belt = blend(gas.belt as number[], gas.zone as number[], apart).map((v) => Math.max(0, Math.min(255, v)));
        }
        if (typeof profile.gas.bands === 'number') gas.bands = Math.max(5, Math.min(18, profile.gas.bands * (0.7 + roll() * 0.7)));
        out.gas = gas;
    }
    weatheredOf.set(profile, out);
    return out;
}

/**
 * World-map fields for an enhanced sheet. A known climate word replaces the
 * temperature string, and temperatureK is cleared so the palette's own Kelvin
 * ice test does not stand in for that word. Anything else is the same object
 * the vanilla sheet uses.
 */
export function enhancedWorldData<T extends { temperature: string; temperatureK: number }>(body: Body | null | undefined, data: T): T {
    const band = knownSurfaceWord(body);
    if (!band) return data;
    return { ...data, temperature: band, temperatureK: 0 };
}
