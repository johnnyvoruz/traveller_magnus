import { applyDotRows, applyForm, blankEnvelope, chartEntry, densityKeeps, FormRefusal, formOf, generateHex, handChartEntry, handFromForm } from '@voyage/generation';
import {
    BUILDER_LIMITS,
    builderPairReady,
    GenerationAllowance,
    BuilderDots,
    BuilderDotsPage,
    BuilderGenerate,
    BuilderGenerateDone,
    FormAnswer,
    FormBlank,
    FormDesign,
    FieldRefusalDetails,
    FormDraft,
    FormKeep,
    FormRead,
    HandEnvelope,
    HandSystem,
    HexRemove,
    HexRestore,
    HexRevert,
    SectorHex,
    SectorGenerate,
    SectorGenerateDone,
    SectorGenerateUndo,
    SectorMake,
    SectorMove,
    SectorRename,
    SectorRev,
    OwnSectorId,
    SectorUndo,
    sha256Hex,
    stable,
    SubsectorLetter,
    SubsectorRename,
    TreeEnvelope,
    TruthOverview,
} from '@voyage/shared';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { Hono } from 'hono';
import enginesPackage from '../../../../packages/engines/package.json' with { type: 'json' };
import { ulid } from '../auth/session';
import { universes } from '../db/schema';
import type { AppEnv } from '../env';
import { fail, ok } from '../http';
import { isAllowanceRefusal, releaseAllowance, takeAllowance, type AllowanceView } from '../auth/allowance';
import { enqueueGenerate } from '../jobs/generate_queue';
import { ONE_SECTOR_LIMIT, sectorCount } from '../jobs/one_sector';
import { defaultPin } from '../universe/defaults';
import { ownedUniverse, type OwnedUniverse } from '../universe/forward';
import { chartHoldsSystem, chartTree, generationSeed, hexDoorPath, HexRefusal, sectorOf, type ChartHex, type Pin } from '../universe/hexes';
import { resolveMadeSectors } from '../universe/sectors';

const OBJECT_QUOTA_BYTES = 250 * 1024 * 1024;

function database(env: AppEnv['Bindings']) {
    return drizzle(env.DB, { schema: { universes } });
}

async function door(owned: OwnedUniverse, path: string, method: string, body?: unknown): Promise<Response> {
    return owned.forward(new Request(`https://universe.internal${path}`, {
        method,
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    }));
}

async function pinFor(env: AppEnv['Bindings'], truthVersion: string | null): Promise<Pin> {
    if (!truthVersion) return defaultPin(null);
    const row = await env.DB.prepare(
        `SELECT seed, settings FROM truth_versions WHERE version = ?`,
    ).bind(truthVersion).first<{ seed: string; settings: string }>();
    if (!row) return defaultPin(truthVersion);
    return { seed: row.seed, settings: JSON.parse(row.settings) as Record<string, unknown>, truthVersion };
}

type ChargeCtx = Parameters<typeof fail>[0];

async function chargeAllowance(c: ChargeCtx, actor: OwnedUniverse['actor'], count: number): Promise<AllowanceView | Response> {
    const taken = await takeAllowance(c.env, actor.id, actor.role, count);
    if (isAllowanceRefusal(taken)) return fail(c, 429, taken.details.code, taken.message, taken.details);
    return taken;
}

const sectorCharts = new Map<string, Record<string, unknown> | null>();

async function chartIndex(env: AppEnv['Bindings'], version: string | null, sector: string): Promise<Record<string, unknown> | null> {
    if (!version || sector.startsWith('~')) return null;
    const key = `${version}/${sector}`;
    const cached = sectorCharts.get(key);
    if (cached !== undefined) return cached;
    const object = await env.PUBLIC_BUCKET.get(`truth/${version}/sectors/${sector}/index.json`);
    if (!object) {
        sectorCharts.set(key, null);
        return null;
    }
    const parsed = JSON.parse(await object.text()) as { hexes?: Record<string, unknown> };
    const hexes = parsed.hexes ?? {};
    sectorCharts.set(key, hexes);
    return hexes;
}

/** How many systems this request will generate. Density is rolled first, so an empty hex is not counted. */
async function systemsToGenerate(
    c: ChargeCtx,
    owned: OwnedUniverse,
    pin: Pin,
    hexKeys: string[],
    density: 'every' | 'sparse' | 'standard' | 'dense',
    filledToo: boolean,
): Promise<number | Response> {
    const sectors = [...new Set(hexKeys.map((hexKey) => sectorOf(hexKey).sector))];
    const listed = await door(owned, `/hexes/hold-rows?sectors=${encodeURIComponent(sectors.join(','))}`, 'GET');
    if (!listed.ok) return listed;
    const body = await listed.json() as { data?: { sector: string; rows: { local: string; present: boolean; holds: boolean }[] }[] };
    const rows = new Map<string, { present: boolean; holds: boolean }>();
    for (const item of body.data ?? []) {
        for (const row of item.rows) rows.set(`${item.sector}/${row.local}`, { present: row.present, holds: row.holds });
    }
    let count = 0;
    for (const hexKey of hexKeys) {
        const { sector, local } = sectorOf(hexKey);
        const row = rows.get(hexKey);
        let holds = false;
        if (row?.present) holds = row.holds;
        else holds = chartHoldsSystem((await chartIndex(c.env, pin.truthVersion, sector))?.[local]);
        const decision = densityKeeps({
            universeSeed: pin.seed,
            hexKey,
            density,
            alone: hexKeys.length === 1,
            holds,
            filledToo,
        });
        if (decision === 'write') count += 1;
    }
    return count;
}

const CHART_SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/;
const CHART_UNREAD = 'The chart for this version could not be read.';
const overviewCells = new Map<string, Map<string, string> | 'unread'>();

function sectorList(raw: string): string[] | null {
    const parts = raw.split(',').map((item) => item.trim()).filter(Boolean);
    if (parts.length < 1 || parts.length > BUILDER_LIMITS.dots) return null;
    if (new Set(parts).size !== parts.length) return null;
    for (const part of parts) {
        if (!OwnSectorId.safeParse(part).success && !CHART_SLUG.test(part)) return null;
    }
    return parts;
}

function sameStamp(header: string | undefined, stamp: string): boolean {
    if (!header) return false;
    return header.split(',').some((item) => {
        const value = item.trim();
        return value === stamp || value === `"${stamp}"` || value === `W/"${stamp}"`;
    });
}

async function overviewMap(env: AppEnv['Bindings'], version: string): Promise<Map<string, string> | 'unread'> {
    const cached = overviewCells.get(version);
    if (cached !== undefined) return cached;
    const object = await env.PUBLIC_BUCKET.get(`truth/${version}/overview.json`);
    if (!object) {
        overviewCells.set(version, 'unread');
        return 'unread';
    }
    let parsed: ReturnType<typeof TruthOverview.safeParse>;
    try {
        parsed = TruthOverview.safeParse(JSON.parse(await object.text()));
    } catch {
        overviewCells.set(version, 'unread');
        return 'unread';
    }
    if (!parsed.success) {
        overviewCells.set(version, 'unread');
        return 'unread';
    }
    const map = new Map(parsed.data.sectors.map((sector) => [sector.slug, sector.cells]));
    overviewCells.set(version, map);
    return map;
}

async function dotSectors(
    c: Parameters<typeof fail>[0],
    owned: OwnedUniverse,
    sectors: string[],
): Promise<Response | { out: { sector: string; cells: string; stamp: string }[]; stamp: string }> {
    const pin = await pinFor(c.env, owned.row.truthVersion);
    await door(owned, '/pin', 'POST', pin);
    const listed = await door(owned, `/hexes/dot-rows?sectors=${encodeURIComponent(sectors.join(','))}`, 'GET');
    if (!listed.ok) return listed;
    const body = await listed.json() as { data?: { sector: string; rows: { local: string; holds: boolean; uwp: string }[] }[] };
    const bySector = new Map((body.data ?? []).map((item) => [item.sector, item.rows]));
    const chart = pin.truthVersion ? await overviewMap(c.env, pin.truthVersion) : null;
    if (chart === 'unread' && sectors.some((sector) => !sector.startsWith('~'))) {
        return fail(c, 503, 'chart_unavailable', CHART_UNREAD);
    }
    const out = [];
    for (const sector of sectors) {
        const known = sector.startsWith('~') || chart === null || chart === 'unread' ? null : (chart.get(sector) ?? null);
        const cells = applyDotRows(known, bySector.get(sector) ?? []);
        out.push({ sector, cells, stamp: await sha256Hex(cells) });
    }
    return { out, stamp: await sha256Hex(out.map((item) => `${item.sector}=${item.stamp}`).join('\n')) };
}

export function mountBuilderRoutes(route: Hono<AppEnv>): void {
    route.get('/:id/hexes', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        const sector = c.req.query('sector') ?? '';
        const cursor = c.req.query('cursor');
        const limit = c.req.query('limit') ?? '100';
        const query = new URLSearchParams({ sector, limit });
        if (cursor) query.set('cursor', cursor);
        return door(owned, `/hexes?${query}`, 'GET');
    });

    route.get('/:id/hexes/dots', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        const sectors = sectorList(c.req.query('sectors') ?? '');
        if (!sectors) return fail(c, 400, 'validation', 'Invalid request.');
        const built = await dotSectors(c, owned, sectors);
        if (built instanceof Response) return built;
        const data = BuilderDotsPage.parse({ sectors: built.out, stamp: built.stamp });
        const headers = { etag: `"${built.stamp}"` };
        if (sameStamp(c.req.header('if-none-match'), built.stamp)) return c.body(null, 304, headers);
        return c.json({ ok: true, data }, 200, headers);
    });

    route.get('/:id/hexes/:sector/dots', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        let sector = c.req.param('sector');
        try { sector = decodeURIComponent(sector); } catch { return fail(c, 400, 'validation', 'Invalid request.'); }
        const sectors = sectorList(sector);
        if (!sectors) return fail(c, 400, 'validation', 'Invalid request.');
        const built = await dotSectors(c, owned, sectors);
        if (built instanceof Response) return built;
        const data = BuilderDots.parse({ cells: built.out[0].cells, stamp: built.out[0].stamp });
        const headers = { etag: `"${data.stamp}"` };
        if (sameStamp(c.req.header('if-none-match'), data.stamp)) return c.body(null, 304, headers);
        return c.json({ ok: true, data }, 200, headers);
    });

    route.get('/:id/hexes/:sector/:local', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        return door(owned, hexDoorPath(keyOf(c)), 'GET');
    });

    route.post('/:id/hexes/:sector/:local/remove', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        return mutate(c, owned, 'remove', keyOf(c));
    });

    route.post('/:id/hexes/:sector/:local/restore', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        return mutate(c, owned, 'restore', keyOf(c));
    });

    route.post('/:id/hexes/:sector/:local/revert', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        let body: unknown;
        try { body = await c.req.json(); } catch { return fail(c, 400, 'validation', 'Invalid JSON.'); }
        const parsed = HexRevert.safeParse(body);
        if (!parsed.success) return fail(c, 400, 'validation', 'Invalid request.', parsed.error.flatten());
        await door(owned, '/pin', 'POST', await pinFor(c.env, owned.row.truthVersion));
        const response = await door(owned, '/hexes/revert', 'POST', {
            hexKey: keyOf(c),
            ...parsed.data,
        });
        if (response.ok) await recount(c.env, owned.row.id, owned);
        return response;
    });

    route.get('/:id/jobs/:jobId', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        const raw = c.req.query('since');
        if (raw !== undefined && !/^\d+$/.test(raw)) return fail(c, 400, 'validation', 'Invalid request.');
        const since = raw === undefined ? '' : `?since=${raw}`;
        return door(owned, `/jobs/${encodeURIComponent(c.req.param('jobId'))}${since}`, 'GET');
    });

    route.post('/:id/jobs/:jobId/stop', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        return door(owned, `/jobs/${encodeURIComponent(c.req.param('jobId'))}/stop`, 'POST');
    });

    route.post('/:id/jobs/:jobId/undo', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        await door(owned, '/pin', 'POST', await pinFor(c.env, owned.row.truthVersion));
        const response = await door(owned, `/jobs/${encodeURIComponent(c.req.param('jobId'))}/undo`, 'POST');
        if (response.ok) await recount(c.env, owned.row.id, owned);
        return response;
    });

    route.get('/:id/hexes/:sector/:local/form', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        const pin = await pinFor(c.env, owned.row.truthVersion);
        await door(owned, '/pin', 'POST', pin);
        const hexKey = keyOf(c);
        const row = await storedHex(owned, hexKey);
        if (row instanceof Response) return row;
        const hash = currentTree(row, await chartOf(c.env, pin, hexKey));
        if (!hash) return fail(c, 404, 'not_found', 'No stored tree.');
        const loaded = await loadEnvelope(c, owned, hexKey, hash, row, pin);
        if (loaded instanceof Response) return loaded;
        try {
            return ok(c, FormRead.parse({ hash, form: formOf(loaded as Parameters<typeof formOf>[0]) }));
        } catch (err) {
            return refusedForm(c, err);
        }
    });

    route.post('/:id/hexes/:sector/:local/draft', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        const input = await readJson(c, FormDraft);
        if (input instanceof Response) return input;
        const pin = await pinFor(c.env, owned.row.truthVersion);
        await door(owned, '/pin', 'POST', pin);
        const hexKey = keyOf(c);
        const row = await storedHex(owned, hexKey);
        if (row instanceof Response) return row;
        const loaded = await loadEnvelope(c, owned, hexKey, input.hash, row, pin);
        if (loaded instanceof Response) return loaded;
        try {
            const applied = applyForm(loaded as Parameters<typeof applyForm>[0], input.changes, input.roll ?? []);
            return ok(c, FormAnswer.parse(applied.answer));
        } catch (err) {
            return refusedForm(c, err);
        }
    });

    route.post('/:id/hexes/:sector/:local/keep', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        const input = await readJson(c, FormKeep);
        if (input instanceof Response) return input;
        const pin = await pinFor(c.env, owned.row.truthVersion);
        await door(owned, '/pin', 'POST', pin);
        const hexKey = keyOf(c);
        const row = await storedHex(owned, hexKey);
        if (row instanceof Response) return row;
        const loaded = await loadEnvelope(c, owned, hexKey, input.hash, row, pin);
        if (loaded instanceof Response) return loaded;
        let applied: ReturnType<typeof applyForm>;
        try {
            applied = applyForm(loaded as Parameters<typeof applyForm>[0], input.changes, input.roll ?? []);
        } catch (err) {
            return refusedForm(c, err);
        }
        if (applied.answer.messages.some((item) => item.holds)) {
            return fail(c, 400, 'validation', 'The engine could not build this system.', { messages: applied.answer.messages });
        }
        const chart = await chartOf(c.env, pin, hexKey);
        return storeTree(c, owned, {
            hexKey,
            envelope: applied.envelope,
            baseRev: input.baseRev,
            roll: row ? row.roll : 0,
            baseHash: row ? row.baseHash : chartTree(chart),
        });
    });

    route.get('/:id/sectors', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        await door(owned, '/pin', 'POST', await pinFor(c.env, owned.row.truthVersion));
        return door(owned, '/sectors', 'GET');
    });

    route.post('/:id/sectors/undo-generate', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        const input = await readJson(c, SectorGenerateUndo);
        if (input instanceof Response) return input;
        await door(owned, '/pin', 'POST', await pinFor(c.env, owned.row.truthVersion));
        const response = await door(owned, '/sectors/undo-generate', 'POST', input);
        if (response.ok) await recount(c.env, owned.row.id, owned);
        return response;
    });

    route.post('/:id/sectors', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        const input = await readJson(c, SectorMake);
        if (input instanceof Response) return input;
        const pin = await pinFor(c.env, owned.row.truthVersion);
        await door(owned, '/pin', 'POST', pin);
        const charted = await chartedSlot(c.env, pin.truthVersion, input.slot.x, input.slot.y);
        if (charted === 'unloaded') return fail(c, 400, 'validation', 'The chart is not loaded.');
        return door(owned, '/sectors', 'POST', {
            ...input,
            id: `~${ulid()}`,
            charted,
        });
    });

    route.post('/:id/sectors/:sectorId/rename', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        const input = await readJson(c, SectorRename);
        if (input instanceof Response) return input;
        await door(owned, '/pin', 'POST', await pinFor(c.env, owned.row.truthVersion));
        return door(owned, sectorDoor(c.req.param('sectorId'), 'rename'), 'POST', input);
    });

    route.post('/:id/sectors/:sectorId/move', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        const input = await readJson(c, SectorMove);
        if (input instanceof Response) return input;
        const pin = await pinFor(c.env, owned.row.truthVersion);
        await door(owned, '/pin', 'POST', pin);
        const charted = await chartedSlot(c.env, pin.truthVersion, input.slot.x, input.slot.y);
        if (charted === 'unloaded') return fail(c, 400, 'validation', 'The chart is not loaded.');
        return door(owned, sectorDoor(c.req.param('sectorId'), 'move'), 'POST', { ...input, charted });
    });

    route.post('/:id/sectors/:sectorId/delete', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        const input = await readJson(c, SectorRev);
        if (input instanceof Response) return input;
        await door(owned, '/pin', 'POST', await pinFor(c.env, owned.row.truthVersion));
        return door(owned, sectorDoor(c.req.param('sectorId'), 'delete'), 'POST', input);
    });

    route.post('/:id/sectors/:sectorId/undo', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        const input = await readJson(c, SectorUndo);
        if (input instanceof Response) return input;
        await door(owned, '/pin', 'POST', await pinFor(c.env, owned.row.truthVersion));
        return door(owned, sectorDoor(c.req.param('sectorId'), 'undo'), 'POST', input);
    });

    route.post('/:id/sectors/:sectorId/subsectors/:letter/clear', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        const letter = SubsectorLetter.safeParse(c.req.param('letter'));
        if (!letter.success) return fail(c, 400, 'validation', 'Invalid subsector.');
        const input = await readJson(c, SectorRev);
        if (input instanceof Response) return input;
        await door(owned, '/pin', 'POST', await pinFor(c.env, owned.row.truthVersion));
        return door(owned, `${sectorDoor(c.req.param('sectorId'))}/subsectors/${letter.data}/clear`, 'POST', input);
    });

    route.post('/:id/sectors/:sectorId/subsectors/:letter', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        const letter = SubsectorLetter.safeParse(c.req.param('letter'));
        if (!letter.success) return fail(c, 400, 'validation', 'Invalid subsector.');
        const input = await readJson(c, SubsectorRename);
        if (input instanceof Response) return input;
        await door(owned, '/pin', 'POST', await pinFor(c.env, owned.row.truthVersion));
        return door(owned, `${sectorDoor(c.req.param('sectorId'))}/subsectors/${letter.data}`, 'POST', input);
    });

    route.post('/:id/hexes/:sector/:local/blank', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        const input = await readJson(c, FormBlank);
        if (input instanceof Response) return input;
        const pin = await pinFor(c.env, owned.row.truthVersion);
        await door(owned, '/pin', 'POST', pin);
        const hexKey = keyOf(c);
        const row = await storedHex(owned, hexKey);
        if (row instanceof Response) return row;
        const chart = await chartOf(c.env, pin, hexKey);
        if (currentTree(row, chart)) return fail(c, 400, 'validation', 'This hex already has a system.');
        let envelope: ReturnType<typeof blankEnvelope>;
        try {
            envelope = blankEnvelope(hexKey, input.edition, {
                seed: pin.seed,
                settings: pin.settings,
                engineVersion: enginesPackage.version,
            }, {
                sType: input.starType,
                subType: input.starSubtype,
                sClass: input.starClass,
            });
        } catch (err) {
            if (err instanceof FormRefusal) return refusedForm(c, err);
            return fail(c, 400, 'validation', 'The generator refused this hex.', { reason: String(err).slice(0, 200) });
        }
        return storeTree(c, owned, {
            hexKey,
            envelope,
            baseRev: input.baseRev,
            roll: 0,
            baseHash: row ? row.baseHash : chartTree(chart),
        });
    });

    route.post('/:id/hexes/:sector/:local/design', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        const input = await readJson(c, FormDesign);
        if (input instanceof Response) return input;
        const pin = await pinFor(c.env, owned.row.truthVersion);
        await door(owned, '/pin', 'POST', pin);
        const hexKey = keyOf(c);
        const row = await storedHex(owned, hexKey);
        if (row instanceof Response) return row;
        const hash = currentTree(row, await chartOf(c.env, pin, hexKey));
        if (!hash) return fail(c, 404, 'not_found', 'No stored tree.');
        const loaded = await loadEnvelope(c, owned, hexKey, hash, row, pin);
        if (loaded instanceof Response) return loaded;
        if (loaded.kind === 'hand') return fail(c, 400, 'validation', 'This system is already designed by hand.');
        let envelope: ReturnType<typeof handFromForm>;
        try {
            envelope = HandEnvelope.parse(handFromForm(formOf(loaded as Parameters<typeof formOf>[0]), hexKey, enginesPackage.version, loaded));
        } catch (err) {
            if (err instanceof FormRefusal) return refusedForm(c, err);
            return fail(c, 400, 'validation', 'This system can\'t be stored. Check the stars and the worlds, then try again.');
        }
        return storeTree(c, owned, {
            hexKey,
            envelope,
            baseRev: input.baseRev,
            roll: row ? row.roll : 0,
            baseHash: row ? row.baseHash : chartTree(await chartOf(c.env, pin, hexKey)),
        });
    });

    route.post('/:id/generate', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        let body: unknown;
        try { body = await c.req.json(); } catch { return fail(c, 400, 'validation', 'Invalid JSON.'); }
        if (body && typeof body === 'object' && Array.isArray((body as { makeSectors?: unknown }).makeSectors)) {
            const listed = (body as { makeSectors: unknown[] }).makeSectors;
            if (listed.length > 0) return generateWithSectors(c, owned, body);
            const { makeSectors: _ignored, ...rest } = body as { makeSectors: unknown[] };
            body = rest;
        }
        const parsed = BuilderGenerate.safeParse(body);
        if (!parsed.success) return fail(c, 400, 'validation', 'Invalid request.', parsed.error.flatten());
        const input = parsed.data;
        if (sectorCount(input.hexKeys) > 1) return fail(c, 400, 'validation', ONE_SECTOR_LIMIT, { reason: 'one_sector' });
        if (!builderPairReady(input.edition, input.generator)) {
            return fail(c, 400, 'validation', 'That engine and generator are not available yet.', { reason: 'generator_unavailable' });
        }
        const pin = await pinFor(c.env, owned.row.truthVersion);
        const counted = await systemsToGenerate(c, owned, pin, input.hexKeys, input.density, input.filledToo);
        if (typeof counted !== 'number') return counted;
        const taken = await chargeAllowance(c, owned.actor, counted);
        if (taken instanceof Response) return taken;
        const allowance = GenerationAllowance.parse(taken);
        await door(owned, '/pin', 'POST', pin);
        if (input.hexKeys.length > 1) {
            const id = ulid();
            const created = await door(owned, '/jobs', 'POST', {
                id,
                spec: {
                    hexKeys: input.hexKeys,
                    edition: input.edition,
                    generator: input.generator,
                    roll: input.roll,
                    filledToo: input.filledToo,
                    density: input.density,
                    seed: pin.seed,
                    settings: pin.settings,
                    engineVersion: enginesPackage.version,
                    captured: {},
                },
            });
            if (!created.ok) {
                await releaseAllowance(c.env, owned.actor.id, owned.actor.role, counted);
                return created;
            }
            try {
                await enqueueGenerate(c.env.GENERATE_QUEUE, owned.row.id, id, input.hexKeys.length);
            } catch (err) {
                await releaseAllowance(c.env, owned.actor.id, owned.actor.role, counted);
                throw err;
            }
            return ok(c, { jobId: id, allowance }, 202);
        }
        const hexKey = input.hexKeys[0];
        const existing = await door(owned, hexDoorPath(hexKey), 'GET');
        const row = existing.status === 404 ? null : await existing.json() as { data?: { state?: string; treeHash?: string | null; baseHash?: string | null } };
        if (existing.status !== 404 && !existing.ok) return existing;
        const held = existing.status === 404 ? null : row?.data ?? null;
        const { sector, local } = sectorOf(hexKey);
        const entry = await publishedHex(c.env, pin.truthVersion, sector, local);
        const holds = (held && held.state !== 'removed' && held.treeHash) || (!held && chartHoldsSystem(entry));
        const decision = densityKeeps({
            universeSeed: pin.seed,
            hexKey,
            density: input.density,
            alone: true,
            holds: Boolean(holds),
            filledToo: input.filledToo,
        });
        if (decision === 'skip' || counted === 0) return ok(c, BuilderGenerateDone.parse({ rows: [], skipped: [hexKey], leftEmpty: 0, allowance }));
        let envelope: ReturnType<typeof generateHex>;
        try {
            envelope = generateHex({
                hexKey,
                edition: input.edition,
                mode: input.generator,
                summary: { type: 'SYSTEM_PRESENT' },
                pinned: {
                    seed: generationSeed(pin.seed, input.roll),
                    settings: pin.settings,
                    engineVersion: enginesPackage.version,
                },
            });
        } catch (err) {
            await releaseAllowance(c.env, owned.actor.id, owned.actor.role, counted);
            return fail(c, 400, 'validation', 'The generator refused this hex.', { reason: String(err).slice(0, 200) });
        }
        const bytes = stable(envelope);
        const size = new TextEncoder().encode(bytes).byteLength;
        const hash = await sha256Hex(bytes);
        const key = `u/${owned.row.id}/objects/${hash}`;
        const prior = await c.env.PRIVATE_BUCKET.head(key);
        let added = 0;
        if (!prior) {
            if (owned.row.objectBytes + size > OBJECT_QUOTA_BYTES) {
                await releaseAllowance(c.env, owned.actor.id, owned.actor.role, counted);
                return fail(c, 400, 'too_large', '250 MB of objects per universe.');
            }
            await c.env.PRIVATE_BUCKET.put(key, bytes, { httpMetadata: { contentType: 'application/json' } });
            added = size;
        }
        const applied = await door(owned, '/hexes/apply', 'POST', {
            hexKey,
            treeHash: hash,
            baseHash: held?.baseHash ?? chartTree(entry),
            roll: input.roll,
            baseRev: input.baseRev,
            engineVersion: enginesPackage.version,
            entry: indexed(envelope, hash),
        });
        if (!applied.ok) {
            if (added) await c.env.PRIVATE_BUCKET.delete(key);
            await releaseAllowance(c.env, owned.actor.id, owned.actor.role, counted);
            return applied;
        }
        if (added) {
            await database(c.env).update(universes).set({
                objectBytes: sql`${universes.objectBytes} + ${added}`,
            }).where(eq(universes.id, owned.row.id)).run();
        }
        await recount(c.env, owned.row.id, owned);
        const stored = await applied.json() as { data: unknown };
        return ok(c, BuilderGenerateDone.parse({ rows: [stored.data], skipped: [], leftEmpty: 0, allowance }));
    });
}

function keyOf(c: Parameters<typeof fail>[0]): string {
    return `${c.req.param('sector')}/${c.req.param('local')}`;
}

function sectorDoor(id: string, action?: string): string {
    const base = `/sectors/${encodeURIComponent(id)}`;
    return action ? `${base}/${action}` : base;
}

async function chartedSlot(env: AppEnv['Bindings'], version: string | null, x: number, y: number): Promise<boolean | 'unloaded'> {
    if (!version) return false;
    const object = await env.PUBLIC_BUCKET.get(`truth/${version}/manifest.json`);
    if (!object) return 'unloaded';
    const parsed = JSON.parse(await object.text()) as { sectors?: { x?: unknown; y?: unknown }[] };
    return (parsed.sectors ?? []).some((sector) => sector.x === x && sector.y === y);
}

function indexed(envelope: { kind?: string; body?: unknown; system?: unknown }, hash: string) {
    if (envelope.kind === 'hand') return SectorHex.parse(handChartEntry(HandSystem.parse(envelope.system), hash));
    const row = envelope.body && typeof envelope.body === 'object' ? envelope.body as Record<string, unknown> : {};
    return SectorHex.parse(chartEntry(row, hash));
}

async function removalChart(env: AppEnv['Bindings'], pin: Pin, hexKey: string): Promise<ChartHex | null> {
    if (!pin.truthVersion) return null;
    const { sector, local } = sectorOf(hexKey);
    const published = await publishedHex(env, pin.truthVersion, sector, local);
    if (!chartHoldsSystem(published)) return null;
    const entry = SectorHex.safeParse(published);
    if (!entry.success) return null;
    return { baseHash: chartTree(published), entry: entry.data };
}

async function mutate(c: Parameters<typeof fail>[0], owned: OwnedUniverse, action: 'remove' | 'restore', hexKey: string): Promise<Response> {
    let body: unknown;
    try { body = await c.req.json(); } catch { return fail(c, 400, 'validation', 'Invalid JSON.'); }
    const parsed = (action === 'remove' ? HexRemove : HexRestore).safeParse(body);
    if (!parsed.success) return fail(c, 400, 'validation', 'Invalid request.', parsed.error.flatten());
    const pin = await pinFor(c.env, owned.row.truthVersion);
    await door(owned, '/pin', 'POST', pin);
    const response = await door(owned, `/hexes/${action}`, 'POST', {
        hexKey,
        baseRev: parsed.data.baseRev,
        chart: action === 'remove' ? await removalChart(c.env, pin, hexKey) : undefined,
    });
    if (response.ok) await recount(c.env, owned.row.id, owned);
    return response;
}

async function recount(env: AppEnv['Bindings'], universeId: string, owned: OwnedUniverse): Promise<void> {
    const response = await door(owned, '/hexes/count', 'GET');
    if (!response.ok) return;
    const body = await response.json() as { data?: { count?: number } };
    const count = body.data?.count;
    if (typeof count !== 'number') return;
    await database(env).update(universes).set({ hexOverrideCount: count }).where(eq(universes.id, universeId)).run();
}

async function publishedHex(env: AppEnv['Bindings'], version: string | null, sector: string, local: string): Promise<unknown> {
    if (!version) return undefined;
    const object = await env.PUBLIC_BUCKET.get(`truth/${version}/sectors/${sector}/index.json`);
    if (!object) return undefined;
    const parsed = JSON.parse(await object.text()) as { hexes?: Record<string, unknown> };
    return parsed.hexes?.[local];
}

type Ctx = Parameters<typeof fail>[0];

type StoredHex = {
    state: string;
    treeHash: string | null;
    baseHash: string | null;
    roll: number;
};

/** The tree a draft may name. A removed row hides the chart. */
function currentTree(row: StoredHex | null, chart: unknown): string | null {
    if (row) return row.state === 'removed' ? null : row.treeHash;
    return chartTree(chart);
}

async function chartOf(env: AppEnv['Bindings'], pin: Pin, hexKey: string): Promise<unknown> {
    const { sector, local } = sectorOf(hexKey);
    return publishedHex(env, pin.truthVersion, sector, local);
}

async function storedHex(owned: OwnedUniverse, hexKey: string): Promise<StoredHex | null | Response> {
    const existing = await door(owned, hexDoorPath(hexKey), 'GET');
    if (existing.status === 404) return null;
    if (!existing.ok) return existing;
    const body = await existing.json() as { data?: StoredHex };
    return body.data ?? null;
}

async function readJson<T>(c: Ctx, schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { flatten: () => unknown } } }): Promise<T | Response> {
    let body: unknown;
    try { body = await c.req.json(); } catch { return fail(c, 400, 'validation', 'Invalid JSON.'); }
    const parsed = schema.safeParse(body);
    if (!parsed.success) return fail(c, 400, 'validation', 'Invalid request.', parsed.error.flatten());
    return parsed.data;
}

function refusedForm(c: Ctx, err: unknown): Response {
    if (err instanceof FormRefusal) {
        const details = err.fieldId ? FieldRefusalDetails.parse({ code: 'field', id: err.fieldId }) : undefined;
        return fail(c, 400, 'validation', err.message, details);
    }
    throw err;
}

async function loadEnvelope(c: Ctx, owned: OwnedUniverse, hexKey: string, hash: string, row: StoredHex | null, pin: Pin): Promise<TreeEnvelope | HandEnvelope | Response> {
    if (row?.state === 'removed') return fail(c, 404, 'not_found', 'No stored tree.');
    if (row?.treeHash && row.treeHash !== hash) {
        return fail(c, 409, 'conflict', 'This hex changed. Reload it, then try again.', { code: 'hex_changed', current: row });
    }
    let text: string | null = null;
    if (row && row.treeHash === hash) {
        const object = await c.env.PRIVATE_BUCKET.get(`u/${owned.row.id}/objects/${hash}`);
        text = object ? await object.text() : null;
    } else if (!row && chartTree(await chartOf(c.env, pin, hexKey)) === hash) {
        const object = await c.env.PUBLIC_BUCKET.get(`objects/${hash}`);
        text = object ? await object.text() : null;
    }
    if (text == null) return fail(c, 404, 'not_found', 'No stored tree.');
    let value: unknown;
    try { value = JSON.parse(text); } catch { return fail(c, 404, 'not_found', 'No stored tree.'); }
    if (value && typeof value === 'object' && (value as { kind?: unknown }).kind === 'hand') {
        const hand = HandEnvelope.safeParse(value);
        if (!hand.success || hand.data.hexKey !== hexKey) return fail(c, 404, 'not_found', 'No stored tree.');
        return hand.data;
    }
    const parsed = TreeEnvelope.safeParse(value);
    if (!parsed.success || parsed.data.hexKey !== hexKey) return fail(c, 404, 'not_found', 'No stored tree.');
    return parsed.data;
}

async function storeTree(c: Ctx, owned: OwnedUniverse, write: {
    hexKey: string;
    envelope: { kind?: string; body?: unknown; system?: unknown };
    baseRev: number;
    roll: number;
    baseHash: string | null;
}): Promise<Response> {
    const bytes = stable(write.envelope);
    const size = new TextEncoder().encode(bytes).byteLength;
    const hash = await sha256Hex(bytes);
    const key = `u/${owned.row.id}/objects/${hash}`;
    const prior = await c.env.PRIVATE_BUCKET.head(key);
    let added = 0;
    if (!prior) {
        if (owned.row.objectBytes + size > OBJECT_QUOTA_BYTES) return fail(c, 400, 'too_large', '250 MB of objects per universe.');
        await c.env.PRIVATE_BUCKET.put(key, bytes, { httpMetadata: { contentType: 'application/json' } });
        added = size;
    }
    const applied = await door(owned, '/hexes/apply', 'POST', {
        hexKey: write.hexKey,
        treeHash: hash,
        baseHash: write.baseHash,
        roll: write.roll,
        baseRev: write.baseRev,
        engineVersion: enginesPackage.version,
        entry: indexed(write.envelope, hash),
        action: 'keep',
    });
    if (!applied.ok) {
        if (added) await c.env.PRIVATE_BUCKET.delete(key);
        return applied;
    }
    if (added) {
        await database(c.env).update(universes).set({
            objectBytes: sql`${universes.objectBytes} + ${added}`,
        }).where(eq(universes.id, owned.row.id)).run();
    }
    await recount(c.env, owned.row.id, owned);
    return applied;
}

/** One box: make the named sectors and generate every hex. One hex is inline. More than one is one job. */
async function generateWithSectors(c: Ctx, owned: OwnedUniverse, body: unknown): Promise<Response> {
    const parsed = SectorGenerate.safeParse(body);
    if (!parsed.success) return fail(c, 400, 'validation', 'Invalid request.', parsed.error.flatten());
    const input = parsed.data;
    if (sectorCount(input.hexKeys) > 1) return fail(c, 400, 'validation', ONE_SECTOR_LIMIT, { reason: 'one_sector' });
    if (!builderPairReady(input.edition, input.generator)) {
        return fail(c, 400, 'validation', 'That engine and generator are not available yet.', { reason: 'generator_unavailable' });
    }
    const pin = await pinFor(c.env, owned.row.truthVersion);
    await door(owned, '/pin', 'POST', pin);
    let planned: ReturnType<typeof resolveMadeSectors>;
    try {
        planned = resolveMadeSectors(input.hexKeys, input.makeSectors, input.makeSectors.map(() => `~${ulid()}`));
    } catch (err) {
        if (err instanceof HexRefusal) return fail(c, 400, 'validation', err.message, err.details);
        throw err;
    }
    const sectors: { id: string; name: string; x: number; y: number; charted: false }[] = [];
    for (const sector of planned.sectors) {
        const charted = await chartedSlot(c.env, pin.truthVersion, sector.x, sector.y);
        if (charted === 'unloaded') return fail(c, 400, 'validation', 'The chart is not loaded.');
        if (charted) return fail(c, 400, 'validation', 'That slot holds a charted sector.', { reason: 'charted' });
        sectors.push({ ...sector, charted: false });
    }
    if (input.hexKeys.length === 1 && input.baseRev === undefined) return fail(c, 400, 'validation', 'Invalid request.');
    const counted = await systemsToGenerate(c, owned, pin, planned.hexKeys, input.density, input.filledToo);
    if (typeof counted !== 'number') return counted;
    const taken = await chargeAllowance(c, owned.actor, counted);
    if (taken instanceof Response) return taken;
    const allowance = GenerationAllowance.parse(taken);
    if (input.hexKeys.length === 1) {
        const hexKey = planned.hexKeys[0]!;
        let envelope: ReturnType<typeof generateHex>;
        try {
            envelope = generateHex({
                hexKey,
                edition: input.edition,
                mode: input.generator,
                summary: { type: 'SYSTEM_PRESENT' },
                pinned: {
                    seed: generationSeed(pin.seed, input.roll),
                    settings: pin.settings,
                    engineVersion: enginesPackage.version,
                },
            });
        } catch (err) {
            await releaseAllowance(c.env, owned.actor.id, owned.actor.role, counted);
            return fail(c, 400, 'validation', 'The generator refused this hex.', { reason: String(err).slice(0, 200) });
        }
        const bytes = stable(envelope);
        const size = new TextEncoder().encode(bytes).byteLength;
        const hash = await sha256Hex(bytes);
        const key = `u/${owned.row.id}/objects/${hash}`;
        const prior = await c.env.PRIVATE_BUCKET.head(key);
        let added = 0;
        if (!prior) {
            if (owned.row.objectBytes + size > OBJECT_QUOTA_BYTES) {
                await releaseAllowance(c.env, owned.actor.id, owned.actor.role, counted);
                return fail(c, 400, 'too_large', '250 MB of objects per universe.');
            }
            await c.env.PRIVATE_BUCKET.put(key, bytes, { httpMetadata: { contentType: 'application/json' } });
            added = size;
        }
        const applied = await door(owned, '/sectors/generate', 'POST', {
            sectors,
            hex: {
                hexKey,
                treeHash: hash,
                baseHash: null,
                roll: input.roll,
                baseRev: input.baseRev,
                engineVersion: enginesPackage.version,
                entry: indexed(envelope, hash),
            },
            job: null,
        });
        if (!applied.ok) {
            if (added) await c.env.PRIVATE_BUCKET.delete(key);
            await releaseAllowance(c.env, owned.actor.id, owned.actor.role, counted);
            return applied;
        }
        if (added) {
            await database(c.env).update(universes).set({
                objectBytes: sql`${universes.objectBytes} + ${added}`,
            }).where(eq(universes.id, owned.row.id)).run();
        }
        await recount(c.env, owned.row.id, owned);
        const stored = await applied.json() as { data?: { sectors?: unknown; hex?: unknown } };
        return ok(c, SectorGenerateDone.parse({
            sectors: stored.data?.sectors ?? [],
            rows: stored.data?.hex ? [stored.data.hex] : [],
            skipped: [],
            jobId: null,
            leftEmpty: 0,
            allowance,
        }), 201);
    }
    const id = ulid();
    const created = await door(owned, '/sectors/generate', 'POST', {
        sectors,
        hex: null,
        job: {
            id,
            spec: {
                hexKeys: planned.hexKeys,
                edition: input.edition,
                generator: input.generator,
                roll: input.roll,
                filledToo: input.filledToo,
                density: input.density,
                seed: pin.seed,
                settings: pin.settings,
                engineVersion: enginesPackage.version,
                captured: {},
            },
        },
    });
    if (!created.ok) {
        await releaseAllowance(c.env, owned.actor.id, owned.actor.role, counted);
        return created;
    }
    try {
        await enqueueGenerate(c.env.GENERATE_QUEUE, owned.row.id, id, planned.hexKeys.length);
    } catch (err) {
        await releaseAllowance(c.env, owned.actor.id, owned.actor.role, counted);
        throw err;
    }
    const stored = await created.json() as { data?: { sectors?: unknown; jobId?: string | null } };
    return ok(c, SectorGenerateDone.parse({
        sectors: stored.data?.sectors ?? [],
        rows: [],
        skipped: [],
        jobId: stored.data?.jobId ?? id,
        leftEmpty: 0,
        allowance,
    }), 202);
}
