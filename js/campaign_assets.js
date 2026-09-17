// Immutable local image assets. Binary payloads never enter history or hexStates.
window.CampaignAssets = (() => {
    'use strict';
    const LIMIT = 50 * 1024 * 1024;
    const cache = new Map();
    const text = (bytes, start, count) => String.fromCharCode(...bytes.subarray(start, start + count));
    const fail = message => { throw new Error(message); };
    function id() {
        return 'ca_' + (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`);
    }
    function header(bytes) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        if (bytes.length < 24) return fail('The file is not a supported image.');
        if (bytes[0] === 137 && text(bytes, 1, 3) === 'PNG' && view.getUint32(4) === 0x0d0a1a0a) {
            for (let pos = 8; pos + 12 <= bytes.length;) {
                const length = view.getUint32(pos);
                if (text(bytes, pos + 4, 4) === 'acTL') return fail('Animated PNG images are not supported. Choose a still image.');
                pos += length + 12;
            }
            return { mime: 'image/png', width: view.getUint32(16), height: view.getUint32(20) };
        }
        if (text(bytes, 0, 4) === 'RIFF' && text(bytes, 8, 4) === 'WEBP') {
            let width, height;
            const u24 = pos => bytes[pos] + (bytes[pos + 1] << 8) + (bytes[pos + 2] << 16);
            for (let pos = 12; pos + 8 <= bytes.length;) {
                const kind = text(bytes, pos, 4), n = view.getUint32(pos + 4, true), p = pos + 8;
                if (p + n > bytes.length) return fail('The WebP image is incomplete.');
                if (kind === 'ANIM' || kind === 'ANMF' || (kind === 'VP8X' && (bytes[p] & 2))) return fail('Animated WebP images are not supported.');
                if (kind === 'VP8X' && n >= 10) { width = u24(p + 4) + 1; height = u24(p + 7) + 1; }
                if (kind === 'VP8 ' && n >= 10) { width ??= view.getUint16(p + 6, true) & 0x3fff; height ??= view.getUint16(p + 8, true) & 0x3fff; }
                if (kind === 'VP8L' && n >= 5) {
                    const bits = view.getUint32(p + 1, true);
                    width ??= (bits & 0x3fff) + 1; height ??= ((bits >>> 14) & 0x3fff) + 1;
                }
                pos = p + n + (n & 1);
            }
            return { mime: 'image/webp', width, height };
        }
        if (bytes[0] === 0xff && bytes[1] === 0xd8) {
            for (let pos = 2; pos + 4 < bytes.length;) {
                if (bytes[pos++] !== 0xff) continue;
                while (bytes[pos] === 0xff) pos++;
                const marker = bytes[pos++];
                if (marker === 0xda || marker === 0xd9) break;
                if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
                if (pos + 2 > bytes.length) break;
                const size = view.getUint16(pos);
                if (size < 2 || pos + size > bytes.length) break;
                if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && size >= 7) {
                    return { mime: 'image/jpeg', width: view.getUint16(pos + 5), height: view.getUint16(pos + 3) };
                }
                pos += size;
            }
        }
        return fail('Choose a still JPEG, PNG, or WebP image. SVG and animated formats are not supported.');
    }
    async function decode(blob) {
        if (typeof createImageBitmap === 'function') return createImageBitmap(blob, { imageOrientation: 'from-image' });
        const url = URL.createObjectURL(blob);
        try {
            const img = new Image(); img.src = url; await img.decode(); return img;
        } finally { URL.revokeObjectURL(url); }
    }
    function dimensions(image) { return [image.naturalWidth || image.width, image.naturalHeight || image.height]; }
    function resized(image, longest) {
        const [width, height] = dimensions(image);
        const ratio = Math.min(1, longest / Math.max(width, height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * ratio));
        canvas.height = Math.max(1, Math.round(height * ratio));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        return new Promise((resolve, reject) => canvas.toBlob(blob => {
            if (!blob) reject(new Error('The browser could not encode this image. Try another file.'));
            else resolve({ blob, width: canvas.width, height: canvas.height });
            canvas.width = canvas.height = 1;
        }, 'image/webp', 0.86));
    }
    async function prepare(file) {
        if (file.size > 10 * 1024 * 1024) return fail('Each incoming image must be 10 MiB or smaller.');
        const bytes = new Uint8Array(await file.arrayBuffer());
        const h = header(bytes);
        if (!h.width || !h.height || h.width * h.height > 20000000) return fail('Each image must be 20 megapixels or smaller.');
        let decoded;
        try { decoded = await decode(new Blob([bytes], { type: h.mime })); }
        catch (_) { return fail('This file could not be decoded as an image. Choose a different file.'); }
        try {
            const [w, h] = dimensions(decoded);
            if (w * h > 20000000) return fail('Each image must be 20 megapixels or smaller.');
            const display = await resized(decoded, 2048);
            const thumb = await resized(decoded, 256);
            const assetId = id();
            return {
                metadata: { id: assetId, mimeType: display.blob.type, width: display.width, height: display.height,
                    byteLength: display.blob.size, thumbnailMimeType: thumb.blob.type,
                    thumbnailWidth: thumb.width, thumbnailHeight: thumb.height, thumbnailByteLength: thumb.blob.size,
                    createdAt: new Date().toISOString() },
                payload: { display: display.blob, thumbnail: thumb.blob }
            };
        } finally { decoded.close?.(); }
    }
    async function read(assetId) {
        if (cache.has(assetId)) return cache.get(assetId);
        const payload = await window.dbManager.readCampaignAsset(assetId);
        if (!payload?.display || !payload?.thumbnail) return fail('Image data is missing. Restore it from a map or system backup.');
        cache.set(assetId, payload);
        return payload;
    }
    function remember(payloads) { for (const [key, value] of payloads) cache.set(key, value); }
    function prune(keep) { for (const key of cache.keys()) if (!keep.has(key)) cache.delete(key); }
    function referenced(store) {
        return new Set(Object.values(store.records).flatMap(r => r.images.map(a => a.assetId)));
    }
    function base64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.slice(reader.result.indexOf(',') + 1));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });
    }
    // Exact UTF-8 serialized dictionary size: the only variable strings in it
    // are ASCII asset IDs, MIME types and base64. Includes both thumbnails and images.
    function serializedSize(store) {
        let count = 2, entries = 0;
        for (const assetId of referenced(store)) {
            const m = store.assets[assetId];
            if (!m) return fail('An image attachment has no asset metadata.');
            const skeleton = { mimeType: m.mimeType, data: '', thumbnailMimeType: m.thumbnailMimeType, thumbnail: '' };
            count += new TextEncoder().encode(JSON.stringify(assetId) + ':' + JSON.stringify(skeleton)).length;
            count += 4 * Math.ceil(m.byteLength / 3) + 4 * Math.ceil(m.thumbnailByteLength / 3);
            if (entries++) count++;
        }
        return count;
    }
    function checkBudget(store) {
        if (serializedSize(store) > LIMIT) return fail('These images exceed the 50 MiB map image budget. Remove images or choose smaller files.');
    }
    async function serialize(store) {
        checkBudget(store);
        const out = Object.create(null);
        for (const assetId of referenced(store)) {
            const p = await read(assetId), m = store.assets[assetId];
            out[assetId] = { mimeType: m.mimeType, data: await base64(p.display),
                thumbnailMimeType: m.thumbnailMimeType, thumbnail: await base64(p.thumbnail) };
        }
        if (new TextEncoder().encode(JSON.stringify(out)).length > LIMIT) return fail('Image payload exceeds the 50 MiB budget.');
        return out;
    }
    async function portableBlob(encoded, mime, expectedBytes, expectedWidth, expectedHeight, longest) {
        if (typeof encoded !== 'string' || encoded.length !== 4 * Math.ceil(expectedBytes / 3) ||
            /[^A-Za-z0-9+/=]/.test(encoded)) return fail('Invalid image data in backup.');
        const binary = atob(encoded);
        if (binary.length !== expectedBytes) return fail('Image size does not match its metadata.');
        const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
        const h = header(bytes);
        if (h.mime !== mime || !h.width || !h.height || Math.max(h.width, h.height) > longest) return fail('Invalid stored image format or dimensions.');
        const blob = new Blob([bytes], { type: mime });
        const image = await decode(blob);
        try {
            const [w, h] = dimensions(image);
            if (w !== expectedWidth || h !== expectedHeight || Math.max(w, h) > longest) return fail('Image dimensions do not match the backup.');
        } finally { image.close?.(); }
        return blob;
    }
    async function deserialize(store, raw = {}) {
        checkBudget(store);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('Invalid image dictionary.');
        const payloads = new Map();
        for (const assetId of referenced(store)) {
            if (!Object.hasOwn(raw, assetId)) return fail(`Missing image payload: ${assetId}. Restore a complete backup.`);
            const r = raw[assetId], m = store.assets[assetId];
            if (r.mimeType !== m.mimeType || r.thumbnailMimeType !== m.thumbnailMimeType) return fail('Image MIME types do not match.');
            const display = await portableBlob(r.data, m.mimeType, m.byteLength, m.width, m.height, 2048);
            const thumbnail = await portableBlob(r.thumbnail, m.thumbnailMimeType, m.thumbnailByteLength, m.thumbnailWidth, m.thumbnailHeight, 256);
            payloads.set(assetId, { display, thumbnail });
        }
        return payloads;
    }
    return { LIMIT, prepare, read, remember, prune, referenced, serializedSize, checkBudget, serialize, deserialize, id };
})();
