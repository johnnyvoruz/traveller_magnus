import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'truth-local');

function walk(dir, files) {
    if (!fs.existsSync(dir)) return files;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, files);
        else files.push(full);
    }
    return files;
}

const files = walk(OUT, []).sort();
const lines = [];
let bytes = 0;
let largest = { path: '', bytes: 0 };
for (const file of files) {
    const buf = fs.readFileSync(file);
    bytes += buf.length;
    const rel = path.relative(OUT, file).replace(/\\/g, '/');
    if (buf.length > largest.bytes) largest = { path: rel, bytes: buf.length };
    lines.push(`${rel} ${crypto.createHash('sha256').update(buf).digest('hex')} ${buf.length}`);
}
const root = crypto.createHash('sha256').update(lines.join('\n')).digest('hex');
console.log(JSON.stringify({ root, files: files.length, bytes, largest }, null, 2));
