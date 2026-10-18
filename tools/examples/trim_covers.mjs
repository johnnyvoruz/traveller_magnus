// Z10: the example covers D5 now crops. D5 (apps/web/src/workspace/market/cover_image.ts, prepareCover with
// trim) trims a map or system package's cover to its systems when the author adds it; the examples were
// added before that, so they keep the whole dark chart. This does the same trim to the files in covers/,
// with the same rule (cover_trim.ts chartTrim on a 400 px look) and the same output limits (1600 px and
// 2 MB, 640 px and 200 KB, WebP at 0.85, 0.72, 0.6, 0.45), then re-adds them through the app's cover route.
//
//   node tools/examples/trim_covers.mjs                       print the plan; nothing written
//   node tools/examples/trim_covers.mjs --apply               trim the files in covers/ (the old pair is kept
//                                                             in covers/untrimmed/ first)
//   node tools/examples/trim_covers.mjs --upload --state <dir> [--port 8863]
//                                                             re-add each trimmed pack's cover to a built state
//                                                             through PUT /api/packages/:id/cover
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PACKAGE_KIND_FAMILIES } from '@voyage/shared';
import { chartTrim, lumaOf } from '../../apps/web/src/workspace/market/cover_trim.ts';
import { coverFiles, uploadCover } from './build_local.mjs';
import {
    EXAMPLE_HANDLE, EXAMPLE_USER_ID, HERE, ROOT, account, arg, flag, localState, q, select, startApi, stopApi, up,
} from './lib.mjs';

export const TRIM_LOOK = 400;
export const LIMITS = { side: 1600, bytes: 2 * 1024 * 1024, thumbSide: 640, thumbBytes: 200 * 1024 };
export const QUALITIES = [85, 72, 60, 45];
const PACK_DIRS = ['packs', 'packs_z'];

/** The store's family of a kind, first match (package.ts PACKAGE_KIND_FAMILIES). */
export function familyOf(kind) {
    const text = String(kind).toLowerCase();
    for (const row of PACKAGE_KIND_FAMILIES) if (row.words.some((word) => text.includes(word))) return row.family;
    return 'other';
}

/** D5 trims only a map or system package's cover. */
export const trimmable = (kind) => ['map', 'system'].includes(familyOf(kind));

/** The listings that name a cover, with their folder. */
export function listings() {
    const out = [];
    for (const dir of PACK_DIRS) {
        const root = path.join(HERE, dir);
        if (!existsSync(root)) continue;
        for (const name of readdirSync(root).sort()) {
            const file = path.join(root, name, 'listing.json');
            if (!existsSync(file)) continue;
            const listing = JSON.parse(readFileSync(file, 'utf8'));
            if (listing.cover) out.push({ slug: name, file, listing });
        }
    }
    return out;
}


/** The box D5 keeps, in the picture's own pixels, or null to keep it whole. Same steps as trimmedChart. */
export async function trimBox(bytes) {
    const meta = await sharp(bytes).metadata();
    const scale = Math.min(1, TRIM_LOOK / Math.max(meta.width, meta.height));
    const w = Math.max(1, Math.round(meta.width * scale));
    const h = Math.max(1, Math.round(meta.height * scale));
    const { data } = await sharp(bytes).resize(w, h, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const box = chartTrim(lumaOf(data, w * h), w, h);
    if (!box) return { width: meta.width, height: meta.height, box: null };
    const left = Math.round(box.x / scale);
    const top = Math.round(box.y / scale);
    return {
        width: meta.width,
        height: meta.height,
        box: { left, top, width: Math.min(meta.width - left, Math.round(box.w / scale)), height: Math.min(meta.height - top, Math.round(box.h / scale)) },
    };
}

/** WebP no larger than `side` on its long side (never enlarged) and `max` bytes, trying each quality. */
export async function fitted(png, side, max) {
    for (const quality of QUALITIES) {
        const out = await sharp(png).resize(side, side, { fit: 'inside', withoutEnlargement: true }).webp({ quality }).toBuffer({ resolveWithObject: true });
        if (out.data.byteLength <= max) return { bytes: out.data, width: out.info.width, height: out.info.height, quality };
    }
    return null;
}

/** The trimmed pair for one cover, or null when D5 would keep it whole. */
export async function trimmedPair(bytes) {
    const seen = await trimBox(bytes);
    if (!seen.box) return { ...seen, pair: null };
    const cut = await sharp(bytes).extract(seen.box).png().toBuffer();
    const image = await fitted(cut, LIMITS.side, LIMITS.bytes);
    const thumb = await fitted(cut, LIMITS.thumbSide, LIMITS.thumbBytes);
    if (!image || !thumb) throw new Error('The trimmed cover does not fit the limits.');
    return { ...seen, pair: { image, thumb } };
}

async function plan() {
    const rows = [];
    for (const l of listings()) {
        const full = path.join(HERE, l.listing.cover);
        const thumb = full.replace(/\.webp$/, '_640.webp');
        if (!trimmable(l.listing.kind)) {
            rows.push({ ...l, full, thumb, action: 'keep', why: `a ${familyOf(l.listing.kind)} package (D5 trims maps and systems only)` });
            continue;
        }
        const done = await trimmedPair(readFileSync(full));
        if (!done.pair) rows.push({ ...l, full, thumb, action: 'keep', why: 'not a map screenshot, or already trimmed (D5 keeps it whole)' });
        else rows.push({ ...l, full, thumb, action: 'trim', done });
    }
    return rows;
}

async function main() {
    const apply = flag('--apply');
    const upload = flag('--upload');
    if (upload) return uploadTrimmed();
    const rows = await plan();
    console.log(apply ? 'Trimming the covers in tools/examples/covers:' : 'Plan (print only; pass --apply to write):');
    for (const r of rows) {
        if (r.action === 'keep') { console.log(`  keep  ${r.slug}: ${r.why}`); continue; }
        const { box, width, height, pair } = r.done;
        console.log(`  trim  ${r.slug}: ${width}x${height} -> box ${box.width}x${box.height} at ${box.left},${box.top}; cover ${pair.image.width}x${pair.image.height} ${pair.image.bytes.byteLength} B (q${pair.image.quality}), thumb ${pair.thumb.width}x${pair.thumb.height} ${pair.thumb.bytes.byteLength} B`);
        if (!apply) continue;
        const keep = path.join(HERE, 'covers', 'untrimmed');
        mkdirSync(keep, { recursive: true });
        for (const file of [r.full, r.thumb]) {
            const to = path.join(keep, path.basename(file));
            if (!existsSync(to)) copyFileSync(file, to);
        }
        writeFileSync(r.full, pair.image.bytes);
        writeFileSync(r.thumb, pair.thumb.bytes);
        console.log(`        wrote ${path.relative(ROOT, r.full)} and ${path.basename(r.thumb)}; the old pair is in covers/untrimmed/`);
    }
}

/** Re-adds the cover of every map or system pack whose files were trimmed (an untrimmed copy exists). */
async function uploadTrimmed() {
    const st = localState(path.resolve(arg('--state', path.join(ROOT, 'findings/examples/local'))), Number(arg('--port', '8863')));
    const todo = [];
    for (const l of listings()) {
        if (!trimmable(l.listing.kind)) continue;
        if (!existsSync(path.join(HERE, 'covers', 'untrimmed', path.basename(l.listing.cover)))) continue;
        const found = select(st, `SELECT id, cover_hash FROM packages WHERE author_id = ${q(EXAMPLE_USER_ID)} AND title = ${q(l.listing.title)}`);
        if (found.length !== 1) throw new Error(`Expected one package titled "${l.listing.title}" by the house account, found ${found.length}. Nothing uploaded.`);
        const cover = coverFiles(l.listing.cover, path.relative(ROOT, l.file));
        todo.push({ ...l, packageId: found[0].id, was: found[0].cover_hash, cover });
    }
    for (const t of todo) console.log(`  ${t.cover.image.hash === t.was ? 'same ' : 'cover'} ${t.packageId}  ${t.listing.title}: ${String(t.was).slice(0, 12)} -> ${t.cover.image.hash.slice(0, 12)}`);
    const changed = todo.filter((t) => t.cover.image.hash !== t.was);
    if (!changed.length) { console.log('Nothing to upload.'); return; }
    const cookie = account(st, EXAMPLE_USER_ID, EXAMPLE_HANDLE);
    const child = startApi(st);
    console.log(`API pid ${child.pid} on ${st.api}`);
    try {
        await up(st);
        for (const t of changed) {
            const made = await uploadCover(st, cookie, t.packageId, t.cover);
            console.log(`  uploaded ${t.packageId} cover ${made.hash.slice(0, 12)}`);
        }
    } finally {
        stopApi(child);
        console.log(`API pid ${child.pid} stopped.`);
    }
    for (const t of changed) {
        const [row] = select(st, `SELECT cover_hash, cover_thumb_hash FROM packages WHERE id = ${q(t.packageId)}`);
        if (row.cover_hash !== t.cover.image.hash || row.cover_thumb_hash !== t.cover.thumb.hash) throw new Error(`${t.listing.title}: the row has ${row.cover_hash}, expected ${t.cover.image.hash}.`);
        console.log(`  checked ${t.packageId}: the row names the trimmed pair`);
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(HERE, 'trim_covers.mjs')) {
    main().catch((err) => { console.error(err.message); process.exitCode = 1; });
}