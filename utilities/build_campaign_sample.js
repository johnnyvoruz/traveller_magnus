// Builds js/campaign_sample.js: 12 Traveller campaign records of each type, each with a still PNG.
// Run from the repo root: node utilities/build_campaign_sample.js
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const TYPES = ['person', 'place', 'business', 'organization', 'job', 'event', 'item', 'note'];
const WHEN = '2026-09-24T12:00:00.000Z';
const W = 128;
const H = 160;

const PALETTES = [
    { bg: [16, 24, 42], fg: [232, 220, 196], accent: [212, 152, 64] },
    { bg: [10, 36, 42], fg: [214, 236, 232], accent: [72, 196, 186] },
    { bg: [42, 16, 24], fg: [240, 214, 208], accent: [196, 72, 78] },
    { bg: [18, 32, 18], fg: [220, 230, 196], accent: [112, 168, 72] },
    { bg: [28, 18, 46], fg: [224, 214, 240], accent: [148, 112, 210] },
    { bg: [40, 26, 12], fg: [240, 224, 196], accent: [204, 132, 52] },
    { bg: [12, 22, 44], fg: [204, 216, 236], accent: [84, 132, 204] },
    { bg: [40, 16, 36], fg: [236, 210, 226], accent: [204, 84, 148] },
    { bg: [12, 34, 32], fg: [206, 232, 220], accent: [56, 168, 140] },
    { bg: [42, 34, 16], fg: [240, 230, 200], accent: [220, 184, 64] },
    { bg: [22, 24, 30], fg: [220, 222, 226], accent: [154, 164, 176] },
    { bg: [40, 20, 12], fg: [236, 214, 196], accent: [184, 78, 40] }
];

const SKINS = [
    [236, 214, 186], [214, 176, 140], [186, 140, 106], [148, 104, 74],
    [112, 74, 52], [232, 196, 170], [196, 154, 122], [164, 122, 92]
];

const FONT = {
    '0': ['111', '101', '101', '101', '111'],
    '1': ['010', '110', '010', '010', '111'],
    '2': ['111', '001', '111', '100', '111'],
    '3': ['111', '001', '111', '001', '111'],
    '4': ['101', '101', '111', '001', '001'],
    '5': ['111', '100', '111', '001', '111'],
    '6': ['111', '100', '111', '101', '111'],
    '7': ['111', '001', '010', '010', '010'],
    '8': ['111', '101', '111', '101', '111'],
    '9': ['111', '101', '111', '001', '111']
};

function mix(a, b, t) {
    return a.map((v, i) => Math.max(0, Math.min(255, Math.round(v + (b[i] - v) * t))));
}
function dark(c, t = 0.55) { return c.map(v => Math.round(v * t)); }
function light(c, t = 0.35) { return c.map(v => Math.round(v + (255 - v) * t)); }

function canvas(w, h) {
    const px = Buffer.alloc(w * h * 4, 255);
    function at(x, y) {
        x = Math.round(x); y = Math.round(y);
        if (x < 0 || y < 0 || x >= w || y >= h) return -1;
        return (y * w + x) * 4;
    }
    function plot(x, y, c) {
        const i = at(x, y);
        if (i < 0) return;
        px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
    }
    function rect(x, y, rw, rh, c) {
        const x0 = Math.max(0, Math.floor(x));
        const y0 = Math.max(0, Math.floor(y));
        const x1 = Math.min(w, Math.ceil(x + rw));
        const y1 = Math.min(h, Math.ceil(y + rh));
        for (let yy = y0; yy < y1; yy++) {
            for (let xx = x0; xx < x1; xx++) plot(xx, yy, c);
        }
    }
    function circle(cx, cy, r, c) {
        const r2 = r * r;
        for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
            for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
                const dx = x - cx, dy = y - cy;
                if (dx * dx + dy * dy <= r2) plot(x, y, c);
            }
        }
    }
    function text(str, x, y, scale, c) {
        let cursor = x;
        for (const ch of str) {
            const rows = FONT[ch];
            if (!rows) { cursor += 4 * scale; continue; }
            rows.forEach((row, ry) => {
                for (let rx = 0; rx < row.length; rx++) {
                    if (row[rx] === '1') rect(cursor + rx * scale, y + ry * scale, scale, scale, c);
                }
            });
            cursor += (rows[0].length + 1) * scale;
        }
    }
    return { w, h, px, plot, rect, circle, text, fill(c) { rect(0, 0, w, h, c); } };
}

function crc32(buf) {
    let c = ~0;
    for (let i = 0; i < buf.length; i++) {
        c ^= buf[i];
        for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
}
function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
}
function encodePng(src) {
    const { w, h, px } = src;
    const raw = Buffer.alloc((w * 4 + 1) * h);
    for (let y = 0; y < h; y++) {
        raw[y * (w * 4 + 1)] = 0;
        px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; ihdr[9] = 6;
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0))
    ]);
}
function downsample(src) {
    const tw = src.w / 2, th = src.h / 2;
    const out = canvas(tw, th);
    for (let y = 0; y < th; y++) {
        for (let x = 0; x < tw; x++) {
            let r = 0, g = 0, b = 0;
            for (let dy = 0; dy < 2; dy++) {
                for (let dx = 0; dx < 2; dx++) {
                    const i = ((y * 2 + dy) * src.w + (x * 2 + dx)) * 4;
                    r += src.px[i]; g += src.px[i + 1]; b += src.px[i + 2];
                }
            }
            out.plot(x, y, [r / 4, g / 4, b / 4]);
        }
    }
    return out;
}
function stars(g, seed) {
    let s = (seed + 1) * 9973;
    for (let i = 0; i < 28; i++) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        const x = s % g.w;
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        const y = s % Math.floor(g.h * 0.62);
        const b = 170 + (s % 80);
        g.plot(x, y, [b, b, Math.min(255, b + 16)]);
        if (s % 5 === 0) g.plot(x + 1, y, [b, b, b]);
    }
}
function badge(g, n, pal) {
    const label = String(n + 1).padStart(2, '0');
    g.rect(8, g.h - 28, 42, 18, dark(pal.bg, 0.45));
    g.text(label, 12, g.h - 24, 2, pal.fg);
}
function frame(g, pal) {
    g.rect(0, 0, g.w, 8, pal.accent);
    g.rect(0, g.h - 6, g.w, 6, dark(pal.bg, 0.4));
}

function drawPerson(g, pal, n) {
    const skin = SKINS[n % SKINS.length];
    const hair = dark(pal.accent, 0.75);
    g.fill(mix(pal.bg, [0, 0, 0], 0.15));
    stars(g, n + 3);
    g.rect(0, 118, g.w, 42, dark(pal.bg, 0.7));
    g.circle(64, 128, 46, pal.fg);
    g.rect(46, 118, 36, 36, pal.accent);
    g.rect(58, 124, 12, 22, light(pal.accent, 0.25));
    g.circle(64, 74, 30, hair);
    if (n % 4 === 1) g.rect(40, 48, 48, 16, hair);
    if (n % 4 === 2) g.circle(64, 70, 34, pal.accent);
    g.circle(64, 80, 26, skin);
    if (n % 4 === 3) g.rect(40, 52, 48, 12, pal.accent);
    g.rect(52, 78, 7, 3, dark(skin, 0.35));
    g.rect(70, 78, 7, 3, dark(skin, 0.35));
    if (n % 3 === 0) g.rect(58, 92, 12, 3, dark(skin, 0.45));
    if (n % 5 === 0) {
        g.rect(46, 74, 14, 8, light(pal.fg, 0.2));
        g.rect(68, 74, 14, 8, light(pal.fg, 0.2));
    }
    frame(g, pal);
    badge(g, n, pal);
}

function drawPlace(g, pal, n) {
    g.fill(pal.bg);
    stars(g, n + 20);
    g.rect(0, 108, g.w, 52, dark(pal.accent, 0.45));
    g.rect(0, 108, g.w, 3, light(pal.accent, 0.2));
    const towers = 2 + (n % 3);
    for (let i = 0; i < towers; i++) {
        const bh = 36 + ((n * 17 + i * 29) % 48);
        const x = 14 + i * 34;
        g.rect(x, 108 - bh, 26, bh, mix(pal.fg, pal.bg, 0.35));
        for (let wy = 108 - bh + 8; wy < 100; wy += 12) {
            g.rect(x + 5, wy, 5, 5, pal.accent);
            g.rect(x + 15, wy, 5, 5, light(pal.accent, 0.3));
        }
    }
    if (n % 3 === 0) g.circle(96, 42, 14, light(pal.fg, 0.45));
    if (n % 3 === 1) {
        g.rect(78, 36, 28, 6, pal.fg);
        g.circle(92, 38, 10, dark(pal.fg, 0.7));
    }
    if (n % 3 === 2) {
        g.rect(86, 28, 6, 40, pal.fg);
        g.circle(89, 26, 8, pal.accent);
    }
    // Generic far-trader silhouette on the pad.
    g.rect(18, 96, 34, 8, dark(pal.fg, 0.55));
    g.rect(28, 88, 16, 10, pal.fg);
    g.rect(44, 98, 10, 4, pal.accent);
    frame(g, pal);
    badge(g, n, pal);
}

function drawBusiness(g, pal, n) {
    g.fill(dark(pal.bg, 0.85));
    stars(g, n + 40);
    g.rect(18, 48, 92, 90, mix(pal.fg, pal.bg, 0.25));
    for (let i = 0; i < 6; i++) g.rect(18, 36 + (i % 2) * 6, 92, 6, i % 2 ? pal.accent : light(pal.accent, 0.25));
    g.rect(22, 56, 84, 16, dark(pal.bg, 0.55));
    g.rect(52, 88, 24, 50, dark(pal.bg, 0.4));
    g.rect(28, 78, 16, 16, light(pal.accent, 0.15));
    g.rect(84, 78, 16, 16, light(pal.accent, 0.15));
    g.rect(0, 132, g.w, 28, dark(pal.accent, 0.4));
    if (n % 2 === 0) g.circle(64, 24, 8, pal.accent);
    frame(g, pal);
    badge(g, n, pal);
}

function drawOrganization(g, pal, n) {
    g.fill(pal.bg);
    stars(g, n + 60);
    g.rect(34, 28, 60, 70, pal.fg);
    g.rect(34, 98, 60, 28, pal.fg);
    // Shield point.
    for (let y = 0; y < 28; y++) {
        const inset = Math.floor(y * 30 / 28);
        g.rect(34 + inset, 126 + y, 60 - inset * 2, 1, pal.fg);
    }
    g.circle(64, 70, 16, pal.accent);
    g.rect(60, 58, 8, 36, light(pal.fg, 0.2));
    if (n % 2) g.rect(40, 36, 48, 8, pal.accent);
    frame(g, pal);
    badge(g, n, pal);
}

function drawJob(g, pal, n) {
    g.fill(mix(pal.bg, [0, 0, 0], 0.2));
    g.rect(28, 22, 72, 118, light(pal.fg, 0.15));
    g.rect(48, 12, 32, 16, pal.accent);
    g.rect(40, 48, 48, 4, dark(pal.bg, 0.45));
    g.rect(40, 62, 40, 4, dark(pal.bg, 0.45));
    g.rect(40, 76, 44, 4, dark(pal.bg, 0.45));
    g.rect(40, 90, 28, 4, dark(pal.bg, 0.45));
    g.rect(36, 108, 14, 14, pal.accent);
    g.rect(40, 114, 10, 3, pal.fg);
    g.rect(44, 110, 3, 10, pal.fg);
    if (n % 2 === 0) g.rect(78, 108, 12, 16, dark(pal.accent, 0.7));
    frame(g, pal);
    badge(g, n, pal);
}

function drawEvent(g, pal, n) {
    g.fill(dark(pal.bg, 0.8));
    stars(g, n + 80);
    g.circle(64, 78, 18 + (n % 5), pal.accent);
    for (let a = 0; a < 8; a++) {
        const ang = (Math.PI * 2 * a) / 8 + n;
        const x = 64 + Math.cos(ang) * 40;
        const y = 78 + Math.sin(ang) * 40;
        g.rect(x - 3, y - 3, 8, 8, light(pal.accent, a % 2 ? 0.35 : 0));
    }
    g.rect(24, 112, 80, 18, pal.fg);
    g.rect(24, 112, 80, 4, pal.accent);
    frame(g, pal);
    badge(g, n, pal);
}

function drawItem(g, pal, n) {
    g.fill(pal.bg);
    stars(g, n + 100);
    const kind = n % 4;
    if (kind === 0) {
        g.rect(34, 48, 60, 70, mix(pal.fg, pal.accent, 0.25));
        g.rect(34, 48, 60, 12, pal.accent);
        g.rect(58, 70, 12, 28, dark(pal.bg, 0.4));
    } else if (kind === 1) {
        g.circle(64, 80, 28, pal.fg);
        g.circle(64, 80, 16, pal.accent);
        g.rect(60, 52, 8, 56, dark(pal.fg, 0.6));
    } else if (kind === 2) {
        g.rect(30, 44, 68, 84, light(pal.fg, 0.2));
        g.rect(38, 56, 52, 8, pal.accent);
        g.rect(38, 74, 40, 4, dark(pal.bg, 0.4));
        g.rect(38, 86, 46, 4, dark(pal.bg, 0.4));
        g.rect(38, 98, 28, 4, dark(pal.bg, 0.4));
    } else {
        g.rect(40, 70, 48, 36, pal.accent);
        g.rect(48, 50, 32, 22, pal.fg);
        g.circle(64, 46, 10, light(pal.accent, 0.2));
    }
    frame(g, pal);
    badge(g, n, pal);
}

function drawNote(g, pal, n) {
    g.fill(dark(pal.bg, 0.75));
    g.rect(26, 18, 78, 124, light(pal.fg, 0.2));
    g.rect(84, 18, 20, 20, dark(pal.fg, 0.65));
    for (let i = 0; i < 6; i++) g.rect(36, 48 + i * 12, 52 - (i === 5 ? 16 : 0), 3, dark(pal.bg, 0.35));
    g.circle(64, 118, 10, pal.accent);
    if (n % 2) g.rect(36, 34, 24, 4, pal.accent);
    frame(g, pal);
    badge(g, n, pal);
}

const DRAW = {
    person: drawPerson,
    place: drawPlace,
    business: drawBusiness,
    organization: drawOrganization,
    job: drawJob,
    event: drawEvent,
    item: drawItem,
    note: drawNote
};

function rec(name, summary, details, location, tags, caption, alt) {
    return { name, summary, details, location, tags, caption, alt };
}

const COPY = {
    person: [
        rec('Captain Idris Voss', 'Master of the free trader Far Margin. Two payments from losing the ship.', 'Voss runs a Jump-2 tramp with a full mortgage and a reputation for arriving. He will take a speculative canister if the broker smiles, and he wants the port factor kept off his bridge. He drinks at the Amber Berth between jumps and pays in freight favors.', 'Far Margin, bridge', ['sample', 'free-trader', 'captain'], 'Captain Idris Voss in a merchant coat', 'Portrait of a free-trader captain with amber collar tabs'),
        rec('Dr. Sera Quill', 'Ship surgeon who revives low berths out of a downport clinic.', 'Quill keeps a licensed clinic under the freight lifts and a quieter list in the back room. She can revive a low berth that a ship medic will not touch. She is currently late for a passenger who is not on any manifest.', 'Downport clinic', ['sample', 'medical', 'low-berth'], 'Dr. Sera Quill, ship surgeon', 'Portrait of a ship surgeon in a pale coat'),
        rec('Marshal Ade Okonkwo', 'Starport marshal. Walks the extrality line at shift change.', 'Okonkwo knows which customs scanner has a blind lane and has not written it down. He will ignore one irregularity in a shift if he can call the favor later. He will not ignore a weapon, a noble, or a missing bond.', 'Extrality line', ['sample', 'starport', 'law'], 'Marshal Ade Okonkwo on the extrality line', 'Portrait of a starport marshal in a dark uniform'),
        rec('Dame Mirelle Cast', 'Local noble. Port factors return her calls before they return the port director’s.', 'Dame Mirelle holds the estate bond that underwrites half the unbonded berths. She does not know her factor is skimming it. Her guard does. She crosses from the highport gallery to the factor’s office once a week and dislikes waiting at customs.', 'Highport gallery', ['sample', 'noble', 'patron'], 'Dame Mirelle Cast', 'Portrait of a noble in a violet coat'),
        rec('Engineer Pax Renn', 'Jump and maneuver tech. Rebuilds a plate with a torch and a grudge.', 'Renn works the unbonded berths because the yard will not have him on a licensed hull. He can put Far Margin’s maneuver plate back before the gantry lease ends. He wants a hand, a watch standing outside, and nobody from Bay 4’s office.', 'Bay 4 gantry', ['sample', 'engineer', 'starship'], 'Engineer Pax Renn', 'Portrait of a ship engineer with a short crop and soot on the collar'),
        rec('Broker Hana Sol', 'Speculative cargo. Quotes in percentages and never in writing.', 'Sol finds cargo, takes a cut, and never stores it under her own name. Her current offer is a sealed canister whose papers are almost right. She will open the hold for an inspection if the inspector is not wearing a marshal’s tab.', 'Startown brokerage', ['sample', 'broker', 'trade'], 'Broker Hana Sol', 'Portrait of a cargo broker with a gold collar pin'),
        rec('Scout Lin Zhao', 'Detached duty. Sells system charts that do not match the last survey.', 'Zhao still carries scout credentials and a compass marked with a private tick for gas giants. The newest plot disagrees with Relay Mast Nine on the last leg. A paper copy of the deleted line is supposed to be at Survey Camp Theta.', 'Scout office', ['sample', 'scout', 'survey'], 'Scout Lin Zhao', 'Portrait of a scout in a teal duty jacket'),
        rec('Prior Yara Nimm', 'Chaplain of the pilgrim host. Books middle passage in blocks of forty.', 'Prior Nimm fills liners between jumps and treats the host as both congregation and courier route. One pilgrim carries the Amber Compact’s warning list. A name is missing from tomorrow’s lock-in, and the ship will not hold the berth.', 'Pilgrim hall', ['sample', 'pilgrim', 'passage'], 'Prior Yara Nimm', 'Portrait of a pilgrim chaplain in an ochre hood'),
        rec('Gunner Bram Keller', 'Hires out for one jump at a time. Will not arm a turret without the interlock key.', 'Keller is ex-marine and does not discuss the sidearm a unit two jumps back still lists as lost. He will board Far Margin if someone checks the turret interlocks first. He drinks one amber and leaves when the marshal walks in.', 'Amber Berth', ['sample', 'gunner', 'mercenary'], 'Gunner Bram Keller', 'Portrait of a hired gunner in a red collar'),
        rec('Navigator Osei Diallo', 'Cuts jump tapes. Keeps a private shadow of every course he files.', 'Diallo’s mast copy and his handwritten folio disagree on the last leg of the newest tape. He says he wants to know which one was altered. He is also waiting to see who tries to sell the wrong course.', 'Chartwrights’ room', ['sample', 'navigator', 'jump'], 'Navigator Osei Diallo', 'Portrait of a navigator with glasses and a dark coat'),
        rec('Factor Tess Marrow', 'Moves small consignments through the extrality zone for clients who pay the bond.', 'Marrow’s canister is legal if it reaches customs before the bond lapses. She wants it walked from the Quiet Docks to the hall, the chit paid, and the receipt brought back. She does not want the marshal to see her do it herself.', 'Quiet Docks office', ['sample', 'factor', 'freight'], 'Factor Tess Marrow', 'Portrait of a freight factor in a rust-colored coat'),
        rec('Administrator Cole Venn', 'Stamps ship papers. Remembers who argued about a clearance.', 'Venn runs the permit desk and keeps the stamp drawer locked. It was opened overnight. One clearance die is missing, and tomorrow’s jump window will not open for a ship that needs it. His cousin at Civic Stamp will pretend not to know.', 'Permit desk', ['sample', 'starport', 'administration'], 'Administrator Cole Venn', 'Portrait of a port administrator in a grey coat')
    ],
    place: [
        rec('The Amber Berth', 'Startown bar under the downport ramp. Pilots, brokers, and off-duty gunners.', 'The Amber Berth sits where the ramp meets the street. Free traders drink here between jumps and trade warnings that never reach the mast. The Compact was signed at the corner table. Marshal Okonkwo’s shift change walks past the door and does not come in.', 'Startown, under the ramp', ['sample', 'startown', 'bar'], 'The Amber Berth under the downport ramp', 'Startown bar built against the downport ramp at night'),
        rec('Downport Customs Hall', 'Scanners, queues, and a side door the marshals pretend not to use.', 'Scanner three has a blind lane. The hall locks from dusk until second watch when the port director is nervous. Day 118 the queue did not move and startown answered. A bond chit is paid at window two, not at the scanners.', 'Downport, window two', ['sample', 'starport', 'customs'], 'Downport Customs Hall', 'Customs hall with scanner lanes and a long queue'),
        rec('Highport Observation Gallery', 'Ring windows over the docking piers.', 'Passengers with a layover watch ships grapple and ungrapple. The Chartwrights held their conclave here and refused to sell tapes for a day. Dame Cast crosses this gallery on the way to her factor. The lights failed for six minutes last month and the piers went dark.', 'Highport ring', ['sample', 'highport', 'passengers'], 'Highport observation gallery', 'A ring gallery looking down on docking piers'),
        rec('The Rust Market', 'Open stalls for ship salvage and belter tools.', 'The Salt Syndicate prices the stalls. A drifted cutter was sold here by the pallet, including a turret ring nobody has claimed. Pax Renn buys plate stock from the third aisle and does not ask where the mill stamps went.', 'Startown salvage row', ['sample', 'market', 'belter'], 'The Rust Market', 'Open salvage market under awnings'),
        rec('Chapel of the Long Jump', 'Pilgrim hall between the freight lifts.', 'The Order fills this hall the night before a liner seals locks. Forty middle passages, one chaplain, and a token that gets a pilgrim to the head of the ramp. The missing name on tomorrow’s list was supposed to collect a token here.', 'Freight concourse', ['sample', 'pilgrim', 'chapel'], 'Chapel of the Long Jump', 'A pilgrim hall set between freight lifts'),
        rec('Bay 4 Drydock', 'A jump-capable hull in pieces, and a yard boss who rents the gantry by the watch.', 'The bay fire started at a welding spark and a fuel vapor. The hull will not make this jump. Renn’s lease on the gantry ends at the next watch, and the wristband that traverses it is counted at the office. Far Margin’s plate is the job on the cradle.', 'Downport yard', ['sample', 'drydock', 'starship'], 'Bay 4 drydock', 'A drydock cradle under a gantry with a hull opened up'),
        rec('Salt Flats Hostel', 'Cheap bunks for middle-passage traffic that missed its ship.', 'Missed-jump passengers sleep here until the next liner. The bunks are inside the extrality fence and outside anyone’s duty roster. A geology case from the outer moon was left under bunk 12 and has Camp Theta’s mark on the lid.', 'Extrality fence', ['sample', 'hostel', 'passage'], 'Salt Flats Hostel', 'A low hostel block beside a floodlit fence'),
        rec('Relay Mast Nine', 'System traffic control. One technician and a dish that drifts.', 'The mast repeats a recognition code from a ship that jumped out last month. During the eclipse the dish went blind and traffic worked from memory. Diallo’s filed tape and the mast copy are both stored here, and they do not match.', 'Outsystem relay', ['sample', 'relay', 'traffic'], 'Relay Mast Nine', 'A relay dish and mast against a dark sky'),
        rec('Underport Warrens', 'Service tunnels beneath the downport.', 'Pallets live down here between the lifts. When the lifts cycle, the bays shift: a pallet stored at dusk is one bay over by dawn. The Quiet Docks flood reached the lowest tunnel and killed the lights. People still give the warrens as an address.', 'Service level', ['sample', 'underport', 'tunnels'], 'The underport warrens', 'Service tunnels under a downport with freight pallets'),
        rec('The Glass Promenade', 'Highport shops for passengers with money and time between jumps.', 'The Merchants’ Circle sets passenger prices from these shops. When a liner dumped cargo to make jump, the promenade auctioned what would not fit the hold. Dame Cast’s factor keeps a window here that does not sell anything.', 'Highport shops', ['sample', 'highport', 'market'], 'The Glass Promenade', 'A glass shopping ring on a highport'),
        rec('Survey Camp Theta', 'A prefab camp on the outer moon, left by the last scout sweep.', 'Zhao’s deleted log line has a paper copy in the camp desk, if the desk is still there. The Surveyors’ Bond still claims the site. A sealed geology case went missing between the camp and the Salt Flats Hostel.', 'Outer moon', ['sample', 'scout', 'moon'], 'Survey Camp Theta', 'A prefab survey camp on a grey moon'),
        rec('The Quiet Docks', 'Unbonded berths past the extrality markers.', 'Ships that do not want an officer at the lock berth here. The Mutual insures them against each other and against the port. A tank in the service tunnel was opened, not burst, and the docks lost power with their manifests. Marrow’s office faces the last berth.', 'Unbonded berths', ['sample', 'docks', 'extrality'], 'The Quiet Docks', 'Unbonded docking berths beyond the port markers')
    ],
    business: [
        rec('Far Margin Haulage', 'One free trader, three mortgages, and a reputation for arriving.', 'Voss’s line is the ship. Cargo is speculative, the jump is 2, and the port fees come out of the next hold. The company mark is an amber tab the Amber Berth still honors for one drink.', 'Far Margin registry', ['sample', 'free-trader', 'shipping'], 'Far Margin Haulage mark', 'A free-trader line’s office mark and a small ship'),
        rec('Quill Low-Berth Clinic', 'Revival and cold sleep. Licensed, mostly.', 'The clinic under the freight lifts is on the port directory. The second list is not. Quill sells low-berth kits to ships whose medics will not open a questionable tube. A revival is overdue.', 'Clinic counter', ['sample', 'medical', 'clinic'], 'Quill Low-Berth Clinic', 'A small clinic front with a medical mark'),
        rec('Keller Security Contractors', 'Shipboard gunners and dock watches, one jump at a time.', 'Keller hires himself and two others. The contract includes turret interlocks and does not include anything the marine unit is still looking for. Payment is half at boarding and half after jump exit.', 'Contract desk', ['sample', 'security', 'mercenary'], 'Keller Security Contractors', 'A security contractor’s storefront'),
        rec('Sol Speculative Brokerage', 'Finds cargo, takes a cut, never stores it.', 'Hana Sol’s office is a table, a wafer, and a percentage. She will not put her name on a hold. The current canister’s papers are one seal short of a Cast estate bond.', 'Broker’s table', ['sample', 'broker', 'speculative'], 'Sol Speculative Brokerage', 'A brokerage stall with a cargo seal'),
        rec('Nimm Passage Bureau', 'Blocks of middle and low berths for the pilgrim host.', 'The bureau buys passage wholesale and sells it to the Order with a token attached. A missing name is a missing fare. The liner will release the block if the name is not at the lock.', 'Passage window', ['sample', 'passage', 'pilgrim'], 'Nimm Passage Bureau', 'A passage bureau window selling berth tokens'),
        rec('Renn Field Repair', 'Maneuver and jump maintenance at the unbonded berths.', 'Renn works where the yard license does not reach. Parts come from the Rust Market. The Bay 4 gantry is a rented exception, and the lease is measured in watches, not days.', 'Unbonded apron', ['sample', 'repair', 'engineer'], 'Renn Field Repair', 'A field-repair shop on an unbonded apron'),
        rec('Marrow Consignment', 'Small freight. Bonded if you pay, and on time if you do.', 'Marrow moves canisters that are legal once the extrality bond is paid. The receipt is the whole business. She does not accompany the walk to window two.', 'Consignment cage', ['sample', 'freight', 'bond'], 'Marrow Consignment', 'A freight cage with a bond window'),
        rec('Cast Estate Factors', 'Commercial agents of House Cast at the port.', 'The factors underwrite unbonded berths with the estate bond. One of them is skimming. The promenade window is theirs and sells nothing. Dame Mirelle still believes the books.', 'Factor’s office', ['sample', 'noble', 'factor'], 'Cast Estate Factors', 'A noble factor’s office with a signet displayed'),
        rec('Diallo Chartwrights', 'Jump tapes and system plots, with handwritten corrections.', 'Osei sells courses the mast will accept and keeps a shadow folio the mast never sees. The newest tape is wrong on the last leg. He sells it anyway, to see where the copy goes.', 'Chart room', ['sample', 'jump', 'charts'], 'Diallo Chartwrights', 'A chart room with jump-tape folios'),
        rec('Line and Lamp Watch', 'Bonded warehouse guards. Not the marshal, and they will say so.', 'The watch covers bonded cages between customs and the lifts. They are not Okonkwo’s people, though they drink where his off-duty officers drink. A missing clearance stamp is not their job unless the cage is.', 'Bonded warehouse', ['sample', 'security', 'warehouse'], 'Line and Lamp Watch', 'A bonded warehouse with a lamp over the door'),
        rec('Zhao Survey Office', 'Sells scout-style system updates to merchants.', 'The office will copy a chart onto a ship’s computer if the captain does not ask why it disagrees with the last survey. Camp Theta is not on the public list of assets. The gas-giant tick on Zhao’s compass is not on the chart either.', 'Survey counter', ['sample', 'scout', 'charts'], 'Zhao Survey Office', 'A small survey office with a dish painted on the sign'),
        rec('Venn Permit Desk', 'Port paperwork, stamps, and the argument you had last time.', 'Cole’s desk issues the clearance a ship needs before the jump window. The stamp drawer was opened overnight and one die is gone. His cousin’s Civic Stamp service will offer a replacement that is not quite the same die.', 'Port authority', ['sample', 'permits', 'starport'], 'Venn Permit Desk', 'A permit desk with a stamp drawer')
    ],
    organization: [
        rec('The Amber Compact', 'Free traders who share jump warnings and owe each other money.', 'Signed at the Amber Berth. Members pass pirate notes and port closures that the mast is slow to post. Half the signatories hold paper on the other half. One pilgrim is carrying the current warning list off-world.', 'Amber Berth, corner table', ['sample', 'free-trader', 'compact'], 'Seal of the Amber Compact', 'An amber seal used by free traders'),
        rec('Starport Watch', 'Marshals and customs officers of the downport.', 'The Watch walks the extrality line, staffs the scanners, and closes the gates when the director is nervous. Okonkwo is the shift the startown regulars know. Scanner three’s blind lane is a Watch secret.', 'Watch ready room', ['sample', 'starport', 'law'], 'Starport Watch badge', 'A starport watch badge'),
        rec('Guild of Chartwrights', 'Navigators who trade jump tapes and, once, refused to.', 'The guild met in the observation gallery and sold nothing for a day. Diallo is a member in poor standing because of the shadow folio. A tape the guild has blessed is what traffic control prefers to see.', 'Guild room, highport', ['sample', 'navigator', 'guild'], 'Chartwrights’ guild mark', 'A guild mark of a folded jump tape'),
        rec('The Salt Syndicate', 'Belters and salvage crews who price the Rust Market.', 'They set the pallet price on drifted hulls. The cutter auction was theirs. They do not love yard bosses, scouts, or anyone who asks about mill stamps. Renn is tolerated because he pays.', 'Rust Market office', ['sample', 'belter', 'syndicate'], 'Salt Syndicate mark', 'A salvage syndicate mark'),
        rec('Order of the Long Jump', 'A pilgrim host that travels by middle passage.', 'The Order moves in blocks of forty, chaplained by Prior Nimm, ticketed by the Passage Bureau. Tokens are priority at the ramp. The host is also a courier route, which the prior will describe as hospitality.', 'Pilgrim hall', ['sample', 'pilgrim', 'order'], 'Order of the Long Jump', 'A pilgrim order’s token and banner'),
        rec('Detached Survey Circle', 'Scouts on detached duty who still compare notes.', 'They were recalled. Most did not report. Zhao still trades charts with the circle and still deletes lines from the public log. Camp Theta is a circle claim as much as a scout one.', 'Circle cache', ['sample', 'scout', 'survey'], 'Detached Survey Circle', 'A scout circle’s badge'),
        rec('Downport Labor Assembly', 'Stevedores and gantry crews.', 'The assembly loads what the brokers sell. They walked out for an hour on day 118 when customs froze the queue. Bay 4’s gantry crews count wristbands at the end of every watch and are short one.', 'Hiring hall', ['sample', 'labor', 'downport'], 'Downport Labor Assembly', 'A labor assembly badge'),
        rec('House Cast Commercial', 'Factors, clerks, and guards of the local noble house.', 'The house bond underwrites the unbonded berths. The commercial arm keeps the promenade window and the estate books. A guard knows about the skim. The dame does not. Losing her signet would be a scandal with a price.', 'Estate office', ['sample', 'noble', 'house'], 'House Cast Commercial', 'A noble house commercial crest'),
        rec('Relay Keepers', 'Technicians who keep system traffic control alive.', 'A handful of people and one drifting dish. They heard the dead ship’s code and logged it. They also hold both copies of Diallo’s tape. During the eclipse they ran the system from memory and wrote the gaps in a paper book.', 'Mast Nine', ['sample', 'relay', 'traffic'], 'Relay Keepers', 'A relay keeper’s badge'),
        rec('Quiet Docks Mutual', 'Captains berthed outside the bond, insuring one another.', 'The Mutual covers unbonded berths against collision, theft, and the port’s attention. The flood was a tank someone opened. The Mutual is looking for that someone without inviting the Watch in.', 'Mutual ledger', ['sample', 'docks', 'captains'], 'Quiet Docks Mutual', 'A mutual-insurance mark for unbonded captains'),
        rec('Surveyors’ Bond', 'Shared claim on Camp Theta and the outer-moon work.', 'The bond is a private claim, not a port lease. The geology case belongs to it. Whoever moved the case to the hostel owes the bond an explanation and the scouts a chart correction.', 'Claim book', ['sample', 'survey', 'claim'], 'Surveyors’ Bond', 'A survey claim seal'),
        rec('Highport Merchants’ Circle', 'Shops on the Glass Promenade. They set passenger prices together.', 'The circle auctioned a liner’s dumped cargo and split the surplus. They are polite to House Cast and cool to free traders. A shop that will not name a price is probably a factor’s window.', 'Promenade office', ['sample', 'highport', 'merchants'], 'Highport Merchants’ Circle', 'A merchants’ circle seal')
    ],
    job: [
        rec('Hold the jump window', 'Get a sealed data wafer to the highport broker before Far Margin undocks.', 'Voss has a cargo authorization under Cast wax. Sol will not release the speculative canister without it, and the ship’s window is this watch. The wafer goes from the Amber Berth to the highport broker. It does not go through scanner three if Okonkwo is on the line.', 'Amber Berth to highport', ['sample', 'patron', 'delivery'], 'Patron ticket: hold the jump window', 'A patron ticket for a data-wafer delivery'),
        rec('Cold berth, warm revival', 'Sit a low-berth revival. Dr. Quill is late and the passenger is not on the list.', 'The tube is in the clinic’s back room. The checklist is in Quill’s kit. The job is to keep the passenger breathing until she arrives and to write down the name they give, because it will not match the ship.', 'Quill clinic, back room', ['sample', 'patron', 'medical'], 'Patron ticket: a low-berth revival', 'A patron ticket for a medical revival watch'),
        rec('Walk the extrality line', 'Okonkwo wants reliable eyes on customs for one shift.', 'Stand the line, note who uses the side door, and do not touch scanner three. He is paying in a favor, not in cash. A weapon on the line ends the job and starts his.', 'Customs hall', ['sample', 'patron', 'starport'], 'Patron ticket: extrality watch', 'A patron ticket for a customs watch'),
        rec('Noble escort', 'Take Dame Cast from the gallery to her factor’s office. One week. Quiet dinners.', 'She dislikes the customs queue and the promenade crowds. The guard who knows about the skim will be nearby and will not introduce himself. Losing sight of her signet is the failure condition.', 'Highport gallery', ['sample', 'patron', 'noble'], 'Patron ticket: noble escort', 'A patron ticket for escorting a noble'),
        rec('Plate and torch', 'Help Pax Renn swap a maneuver plate before the yard boss reclaims the gantry.', 'Bay 4, this watch. The wristband gets the gantry to move. Renn brings the plate from the Rust Market. Someone stands outside the office so the band count does not happen early. The hull on the next cradle is not the job.', 'Bay 4', ['sample', 'patron', 'repair'], 'Patron ticket: maneuver plate', 'A patron ticket for a drydock repair'),
        rec('Percentages', 'Look at a hold for Broker Sol. The manifest summary is not the cargo.', 'She wants eyes on a sealed canister, a note of the seal, and no marshal’s tab in the compartment. Payment is a cut of the percentage if the papers can be made to match a Cast bond. Walking away is allowed and cheaper.', 'Speculative hold', ['sample', 'patron', 'broker'], 'Patron ticket: inspect a hold', 'A patron ticket for a hold inspection'),
        rec('Which chart is wrong', 'Zhao’s plot and Mast Nine disagree. Find out which one was changed.', 'The mast has both tapes. Camp Theta may have the paper line Zhao deleted. The job is a comparison, not a new survey, unless the outer moon is the only place the paper still exists.', 'Mast Nine or Camp Theta', ['sample', 'patron', 'scout'], 'Patron ticket: conflicting charts', 'A patron ticket to compare two system charts'),
        rec('The missing pilgrim', 'Prior Nimm has forty middle passages and one empty name. The ship will not wait.', 'The token was never collected at the chapel. Check the hostel, the ramp, and the warning list the host is carrying. A pilgrim who is really a courier will not be wearing the token openly.', 'Chapel and ramp', ['sample', 'patron', 'pilgrim'], 'Patron ticket: missing pilgrim', 'A patron ticket to find a missing passenger'),
        rec('Check the interlocks', 'Bram Keller will not board until the turret interlocks are proven.', 'Far Margin’s turret key is in Voss’s locker. Keller wants the interlocks cycled and the key back in the locker, not in his pocket. He boards at the end of the watch or he takes another ship.', 'Far Margin turret', ['sample', 'patron', 'ship'], 'Patron ticket: turret interlocks', 'A patron ticket to check a ship’s turret interlocks'),
        rec('The two tapes', 'Diallo’s handwritten folio and the mast copy do not match. Say which changed.', 'Both are at Mast Nine. The Keepers will open the cabinet for a guild member or for cash. The last leg is the lie. Reporting the answer to Diallo and selling it to Sol are different jobs, and he knows that.', 'Mast Nine cabinet', ['sample', 'patron', 'jump'], 'Patron ticket: two jump tapes', 'A patron ticket to compare jump tapes'),
        rec('Pay the bond', 'Walk Marrow’s canister from the Quiet Docks to customs and pay the chit.', 'The canister is legal once window two takes the bond. The receipt comes back to Marrow. The flood damage in the tunnel is on the way. Okonkwo on the line makes the walk longer and still legal.', 'Quiet Docks to window two', ['sample', 'patron', 'freight'], 'Patron ticket: pay a customs bond', 'A patron ticket to walk a bonded canister to customs'),
        rec('The stamp drawer', 'Inventory Venn’s stamps and say which clearance is missing.', 'The drawer was opened overnight. One die is gone. Ships that need that clearance miss tomorrow’s window. Civic Stamp will offer a cousin’s replacement. The job is the inventory and the name of the clearance, not a new die.', 'Permit desk', ['sample', 'patron', 'starport'], 'Patron ticket: missing clearance stamp', 'A patron ticket to inventory port stamps')
    ],
    event: [
        rec('Highport blackout', 'The ring lost power for six minutes. Grappled ships drifted in their collars.', 'Piers went dark, the gallery went quiet, and traffic control argued with the Keepers about whose board was lying. Nothing undocked. Two captains later claimed cargo shifted. The Merchants’ Circle wrote both claims down.', 'Highport ring', ['sample', 'highport', 'blackout'], 'Highport blackout', 'A highport ring in the dark with a few emergency lights'),
        rec('Signing of the Amber Compact', 'Free traders swore to share warnings. Half of them already held each other’s paper.', 'The corner table at the Amber Berth, after last jump’s arrivals. Voss signed. Sol watched and did not. The warning list from that night is the one a pilgrim is carrying now.', 'Amber Berth', ['sample', 'compact', 'free-trader'], 'Signing of the Amber Compact', 'Captains gathered around a bar table under an amber light'),
        rec('Day 118 queue', 'Customs shut the scanners. Startown did not wait politely.', 'The Watch closed the hall, the labor assembly stopped loading, and the ramp filled. Okonkwo kept the line from becoming a riot and has not forgotten who pushed. Scanner three was not the scanner they shut.', 'Downport ramp', ['sample', 'customs', 'riot'], 'The day 118 customs queue', 'A stalled crowd outside a customs hall'),
        rec('Pilgrimage of the Long Jump', 'The host filled every middle berth on three ships.', 'Prior Nimm’s largest crossing. The Passage Bureau ran out of tokens and wrote names on scrap. One of those scraps is the missing name. The courier among the pilgrims boarded on the second ship.', 'Liner ramps', ['sample', 'pilgrim', 'passage'], 'Pilgrimage of the Long Jump', 'A crowd of pilgrims at a row of boarding ramps'),
        rec('Bay 4 fire', 'A welding spark, fuel vapor, and a hull that will miss its jump.', 'The cradle next to Renn’s job burned. The gantry stopped. A wristband went missing in the evacuation, which is why the office counts them twice now. Nobody has agreed whose spark it was.', 'Drydock', ['sample', 'drydock', 'fire'], 'The Bay 4 fire', 'A drydock fire under a gantry'),
        rec('Chartwrights’ conclave', 'Navigators met in the gallery and refused to sell tapes for a day.', 'The guild was answering the blackout and the mismatched mast logs. Diallo was asked to leave his folio outside. For one day, traffic control accepted only tapes already on file. Merchants paid double the morning after.', 'Observation gallery', ['sample', 'charts', 'guild'], 'Chartwrights’ conclave', 'Navigators gathered in a gallery with tapes on the table'),
        rec('Rust Market auction', 'Salvage from a drifted cutter, sold by the pallet.', 'The Salt Syndicate ran it. A turret ring, plate stock, and a recognition transponder went in three lots. The transponder’s code is the one Mast Nine still repeats. The buyer has not come forward.', 'Rust Market', ['sample', 'auction', 'salvage'], 'Rust Market auction', 'An auction crowd around salvaged ship parts'),
        rec('Survey recall', 'Detached scouts were told to report. Most did not.', 'The circle treated the recall as optional. Zhao sold two charts the same day and deleted a line the same night. Camp Theta’s desk was cleared by someone who was not on the recall list.', 'Scout office', ['sample', 'scout', 'recall'], 'The survey recall', 'A recall notice pinned in a scout office'),
        rec('Customs lockdown', 'The extrality gates stayed shut from dusk until second watch.', 'The director ordered it. Okonkwo walked it. Marrow’s bond clock kept running. Two ships missed their window and one of them was Far Margin, which is why Voss is short a payment.', 'Extrality gates', ['sample', 'customs', 'lockdown'], 'Customs lockdown', 'Closed extrality gates at dusk'),
        rec('Quiet Docks flood', 'A tank opened in the service tunnel. Unbonded berths lost power and paper.', 'The Mutual calls it sabotage and is right. Manifests stored in the lower office are pulp. Captains are reconstructing cargo from memory, which Sol considers a business opportunity.', 'Service tunnel', ['sample', 'docks', 'flood'], 'The Quiet Docks flood', 'A flooded service tunnel beside unbonded docks'),
        rec('Promenade auction', 'A liner dumped cargo to make jump. The circle sold it by evening.', 'Passenger luxuries, a case of estate wine, and a sealed geology case with a moon-camp mark. The geology case should not have been in that hold. The circle’s ledger names the buyer only as a hostel bunk.', 'Glass Promenade', ['sample', 'auction', 'highport'], 'Promenade auction', 'Goods laid out for sale on a highport promenade'),
        rec('Eclipse at Mast Nine', 'The relay went blind while the moon crossed the primary.', 'Traffic worked from the Keepers’ paper book. The gap in that book is the same hour Diallo’s tape was copied. Zhao was on the outer moon and says the eclipse is why the survey photos failed. The dish drift started that night and did not stop.', 'Mast Nine', ['sample', 'eclipse', 'relay'], 'Eclipse at Mast Nine', 'A relay dish silhouetted against an eclipsed star')
    ],
    item: [
        rec('Sealed data wafer', 'Far Margin’s cargo authorization. The seal is Cast estate wax.', 'Sol will not open a deal without it. The wax matches Dame Mirelle’s signet if the signet has not been copied. Voss treats the wafer as the ship’s next payment.', 'Carried by Voss', ['sample', 'wafer', 'cargo'], 'A sealed data wafer', 'A data wafer closed with an amber wax seal'),
        rec('Low-berth revival kit', 'Quill’s case. Ampoules, a throat tube, and a checklist in her hand.', 'The checklist does not match the port’s standard card. The kit is enough to start a revival and not enough to explain who the passenger is.', 'Clinic back room', ['sample', 'medical', 'kit'], 'A low-berth revival kit', 'An open medical case with ampoules and a checklist'),
        rec('Amber Berth tab', 'A metal chit good for one drink and a quiet table.', 'Far Margin Haulage still honors it, and so does the bar. Compact members know the corner table it buys. It is not money anywhere else on the port.', 'Amber Berth till', ['sample', 'bar', 'token'], 'An Amber Berth tab', 'A metal bar chit stamped with an amber mark'),
        rec('Survey compass', 'Zhao’s hand compass, ticked for gas giants in a private code.', 'The tick does not appear on the chart she sells. It matches a mark in the Camp Theta desk. She will notice if it is moved and will not say why.', 'Zhao’s jacket', ['sample', 'scout', 'compass'], 'A survey compass', 'A hand compass with private survey marks'),
        rec('Customs bond chit', 'A paid extrality bond for one canister. Window two, before the clock runs out.', 'Marrow’s whole job is this chit and the receipt that comes back. The lockdown ate part of the clock. Okonkwo can read a chit from across the line.', 'Marrow’s cage', ['sample', 'bond', 'customs'], 'A customs bond chit', 'A port bond chit for a single canister'),
        rec('Pilgrim token', 'Order of the Long Jump. Worn on a cord. Priority when the host boards.', 'The missing passenger never collected one. The courier in the host wears one and is not the person the token was issued to. Nimm can read the number on the back.', 'Chapel desk', ['sample', 'pilgrim', 'token'], 'A pilgrim token', 'A cord token of the Order of the Long Jump'),
        rec('Turret interlock key', 'Far Margin will not arm a turret without it. Keller will not board until it has been used and put back.', 'The key lives in Voss’s locker. It is a lock, not a weapon. Cycling it is the whole of Keller’s condition.', 'Captain’s locker', ['sample', 'starship', 'key'], 'A turret interlock key', 'A ship key on a short tagged ring'),
        rec('Jump tape folio', 'Diallo’s courses, with handwritten corrections in the margin.', 'The last leg of the newest tape is wrong on purpose. The folio and the mast copy disagree about who introduced the error. The guild asked him to leave this book outside the conclave.', 'Chart room', ['sample', 'jump', 'folio'], 'A jump-tape folio', 'A folio of jump tapes with handwritten corrections'),
        rec('Relay cipher cylinder', 'Mast Nine’s backup authentication for traffic control.', 'The Keepers use it when the dish is lying. It was out of the cabinet during the eclipse hour. It authenticates a board. It does not plot a course.', 'Mast cabinet', ['sample', 'relay', 'cipher'], 'A relay cipher cylinder', 'A short cipher cylinder from a relay mast'),
        rec('Outer-moon sample case', 'Geology from Camp Theta. The Surveyors’ Bond owns it. A liner somehow sold it.', 'The case turned up in the promenade auction and was delivered to a hostel bunk. The mark on the lid matches the camp desk. Zhao wants it and will not file a report.', 'Salt Flats Hostel, bunk 12', ['sample', 'survey', 'case'], 'An outer-moon sample case', 'A sealed sample case marked with a survey camp stamp'),
        rec('Cast signet', 'Dame Mirelle’s seal. Factors honor it. A copy would make the wafer’s wax worthless.', 'She wears it to the factor’s office. The guard watches it more closely than he watches her. Losing it is a scandal the house would price in cargo, not in apologies.', 'With Dame Cast', ['sample', 'noble', 'signet'], 'The Cast signet', 'A noble signet ring with a house crest'),
        rec('Drydock band', 'Bay 4 wristband. The gantry will not traverse without it.', 'The office is short one since the fire. Renn’s lease assumes a band that is counted at the end of the watch. Wearing one into the bay is the difference between a repair and a trespass.', 'Yard office', ['sample', 'drydock', 'band'], 'A drydock access band', 'A yard wristband for a gantry')
    ],
    note: [
        rec('Voss is out of payments', 'Two mortgage payments and the ship is gone. He will take the canister.', 'Referee note. Far Margin’s next fee is the cargo Sol is brokering. If the wafer is late or the lockdown repeats, Voss signs whatever percentage is in front of him. He will not sell the turret key. He will sell a berth.', 'Referee only', ['sample', 'referee', 'voss'], 'Referee note on Captain Voss', 'A handwritten referee note about a free trader’s mortgage'),
        rec('Scanner three is blind', 'Okonkwo knows the lane. It is not written down.', 'Referee note. The blind lane is a Watch secret, not a rumor in the bar. He lets one irregularity a shift go past and collects the favor later. A weapon, a noble, or an unpaid bond does not qualify. Day 118 was not about this scanner.', 'Referee only', ['sample', 'referee', 'customs'], 'Referee note on scanner three', 'A referee note describing a blind customs lane'),
        rec('The passenger is not listed', 'Quill is reviving someone no ship will claim.', 'Referee note. The low berth arrived without papers during the pilgrimage. The name they give will match neither the liner nor the Order’s list. The courier pilgrim knows the tube is there and has not told Nimm.', 'Referee only', ['sample', 'referee', 'medical'], 'Referee note on an unlisted passenger', 'A referee note about an unlisted low-berth passenger'),
        rec('The mast repeats a dead ship', 'Mast Nine answers a code from a cutter that jumped last month.', 'Referee note. The code matches the transponder sold at the Rust Market auction. The Keepers logged it and do not know the transponder is on a pallet. During the eclipse the repeats were written into the paper book by hand.', 'Referee only', ['sample', 'referee', 'relay'], 'Referee note on a dead ship code', 'A referee note about a relay repeating an old ship code'),
        rec('The factor is skimming', 'House Cast’s agent is taking from the estate bond. The dame does not know. Her guard does.', 'Referee note. The promenade window that sells nothing is where the skim is counted. The guard will not tell Dame Mirelle unless the signet is threatened. Sol’s canister needs this bond to look legal.', 'Referee only', ['sample', 'referee', 'noble'], 'Referee note on the Cast factor', 'A referee note about a noble’s factor skimming a bond'),
        rec('The warrens move', 'A pallet stored at dusk is one bay over by dawn, when the lifts cycle.', 'Referee note. This is mechanical, not mystical. Crews who give a warren address expect you to be wrong by one bay in the morning. The flood reached the lowest of these tunnels and scrambled what was left.', 'Referee only', ['sample', 'referee', 'underport'], 'Referee note on the warrens', 'A referee note about freight bays that shift overnight'),
        rec('One favor per shift', 'Okonkwo looks away once. He does not look away from a weapon.', 'Referee note. The favor is collected later, in information or in a name. Spending it on Marrow’s canister is legal anyway if the chit is real, so it is wasted there. Spending it on Keller’s sidearm would fail.', 'Referee only', ['sample', 'referee', 'marshal'], 'Referee note on the marshal’s favor', 'A referee note about a marshal who trades one favor a shift'),
        rec('The pilgrimage carries mail', 'One pilgrim is the Amber Compact’s courier.', 'Referee note. The warning list from the signing is on the second ship, on a person whose token number is not their own. Nimm calls it hospitality. Voss calls it the only news he trusts. The missing name is a different person.', 'Referee only', ['sample', 'referee', 'pilgrim'], 'Referee note on the pilgrim courier', 'A referee note about a courier hidden in a pilgrim host'),
        rec('Keller’s sidearm is still on a list', 'A marine unit two jumps back has it as lost. He will not discuss it.', 'Referee note. The turret contract is legitimate. The sidearm is the part that brings trouble if a marshal sees it. Okonkwo’s one favor will not cover it. Keller boards without it if the interlocks check out.', 'Referee only', ['sample', 'referee', 'keller'], 'Referee note on Keller’s sidearm', 'A referee note about a hired gunner’s listed weapon'),
        rec('The last leg is a lie', 'Diallo’s newest tape is wrong on purpose. He is waiting to see who sells it.', 'Referee note. The folio, the mast copy, and the eclipse hour in the Keepers’ book can show who changed it. Sol will pay for the wrong course if she thinks a rival captain will buy it. The guild does not know yet.', 'Referee only', ['sample', 'referee', 'jump'], 'Referee note on a false jump tape', 'A referee note about a navigator’s deliberate bad course'),
        rec('Someone opened the tank', 'The Quiet Docks flood was not a failure. The Mutual is looking quietly.', 'Referee note. Manifests in the lower office are destroyed, which helps anyone whose cargo could not survive an inspection. The Mutual will pay for a name and will not take that name to the Watch. Marrow’s receipt book survived. Her neighbors’ books did not.', 'Referee only', ['sample', 'referee', 'flood'], 'Referee note on the flood', 'A referee note about a sabotage flood at the docks'),
        rec('Zhao deleted a line', 'An outer-moon contact was logged and then removed. The paper is at Camp Theta.', 'Referee note. The contact is why the survey compass has a private tick and why the sample case matters. The recall is cover. Whoever cleared the camp desk missed the copy under the blotter, or moved it into the case.', 'Referee only', ['sample', 'referee', 'scout'], 'Referee note on a deleted survey line', 'A referee note about a scout who deleted a contact')
    ]
};

function build() {
    for (const type of TYPES) {
        if (!COPY[type] || COPY[type].length !== 12) throw new Error(`${type} needs 12 records, has ${COPY[type] ? COPY[type].length : 0}`);
    }
    const records = {};
    const assets = {};
    const payloads = {};
    TYPES.forEach((type, typeIndex) => {
        COPY[type].forEach((row, index) => {
            const n = String(index + 1).padStart(2, '0');
            const recordId = `cr_sample_${type}_${n}`;
            const assetId = `ca_sample_${type}_${n}`;
            const pal = PALETTES[index];
            const full = canvas(W, H);
            DRAW[type](full, pal, index);
            const thumb = downsample(full);
            const display = encodePng(full);
            const thumbnail = encodePng(thumb);
            const view = new DataView(display.buffer, display.byteOffset, display.byteLength);
            if (display[0] !== 137 || display.toString('ascii', 1, 4) !== 'PNG') throw new Error('PNG signature failed');
            if (view.getUint32(16) !== W || view.getUint32(20) !== H) throw new Error('IHDR display size failed');
            const thumbView = new DataView(thumbnail.buffer, thumbnail.byteOffset, thumbnail.byteLength);
            if (thumbView.getUint32(16) !== W / 2 || thumbView.getUint32(20) !== H / 2) throw new Error('IHDR thumb size failed');
            assets[assetId] = {
                id: assetId,
                mimeType: 'image/png',
                width: W,
                height: H,
                byteLength: display.length,
                thumbnailMimeType: 'image/png',
                thumbnailWidth: W / 2,
                thumbnailHeight: H / 2,
                thumbnailByteLength: thumbnail.length,
                createdAt: WHEN
            };
            const data = display.toString('base64');
            const thumb64 = thumbnail.toString('base64');
            if (data.length !== 4 * Math.ceil(display.length / 3)) throw new Error('Bad display base64 length');
            if (thumb64.length !== 4 * Math.ceil(thumbnail.length / 3)) throw new Error('Bad thumb base64 length');
            payloads[assetId] = { mimeType: 'image/png', data, thumbnailMimeType: 'image/png', thumbnail: thumb64 };
            records[recordId] = {
                id: recordId,
                type,
                name: row.name,
                summary: row.summary,
                details: row.details,
                tags: ['sample', type, ...row.tags.filter(tag => tag !== 'sample')],
                anchor: { kind: 'system', hexId: '1-A-0101', locationLabel: row.location },
                visibility: 'referee',
                provenance: { kind: 'campaign', citation: 'Traveller sample campaign' },
                links: [],
                images: [{
                    assetId,
                    caption: row.caption,
                    altText: row.alt,
                    credit: 'Sample illustration',
                    sourceUrl: ''
                }],
                primaryImageId: assetId,
                createdAt: WHEN,
                updatedAt: WHEN
            };
            if (row.name.length > 120 || row.summary.length > 300 || row.location.length > 300 || row.caption.length > 1000 || row.alt.length > 1000) {
                throw new Error(`Field too long on ${recordId}`);
            }
            void typeIndex;
        });
    });
    const orderedIds = [];
    for (let i = 0; i < 12; i++) {
        for (const type of TYPES) orderedIds.push(`cr_sample_${type}_${String(i + 1).padStart(2, '0')}`);
    }
    const orderedRecords = {};
    for (const id of orderedIds) orderedRecords[id] = records[id];
    const file = {
        campaignAtlas: { schemaVersion: 1, records: orderedRecords, assets },
        campaignAssets: payloads
    };
    const target = path.join(__dirname, '..', 'js', 'campaign_sample.js');
    const body = `// Generated by utilities/build_campaign_sample.js. Sample Traveller campaign records for local testing.\nwindow.CAMPAIGN_SAMPLE = ${JSON.stringify(file)};\n`;
    fs.writeFileSync(target, body);
    const counts = Object.fromEntries(TYPES.map(type => [type, Object.values(orderedRecords).filter(row => row.type === type).length]));
    console.log(`Wrote ${target}`);
    console.log(`Records ${Object.keys(orderedRecords).length}`, counts);
    console.log(`Images ${Object.keys(payloads).length}, file ${(Buffer.byteLength(body) / 1024 / 1024).toFixed(2)} MiB`);
}

build();
