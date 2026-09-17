/** Browser regression coverage for the v0.18.0 inspector and campaign storage.
 * npm install --prefix .tmp/atlas-testing --no-save --no-package-lock playwright
 * node utilities/campaign_atlas_test.js
 * Uses an isolated, headless Chrome context. Never opens the user's browser profile.
 */
const path = require('path');
const assert = require('assert/strict');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '../.tmp/atlas-testing/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); console.log('PASS ' + name); };

(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('dialog', dialog => dialog.accept());
    const evalIn = fn => page.evaluate(fn);
    const undo = async (redo = false) => {
        await page.locator('#atlas-title').click();
        await page.keyboard.press(redo ? 'Control+Shift+z' : 'Control+z');
        await page.waitForFunction(() => !CampaignAtlas.isBusy());
    };
    try {
        await page.goto('file:///' + path.join(root, 'hex_map.html').replaceAll('\\', '/'));
        await page.waitForFunction(() => window.CampaignAtlas && document.getElementById('atlas-title').textContent);
        await page.locator('#btn-launch-app').click();
        await page.locator('#splash-screen').waitFor({ state: 'hidden' });
        await evalIn(() => {
            // Synthetic display fixture, not a rules-generation assertion.
            const world = { name: 'Harbor', type: 'Mainworld', uwp: 'A867A99-C', au: 1, orbitId: 3,
                parentStarIdx: 0, orbitType: 'S-Type', size: 8, starport: 'A', tl: 12, gravity: 1,
                diamKm: 12000, meanTempK: 285, tradeCodes: ['Hi'], moons: [] };
            const star = { name: 'Harbor A', sType: 'G', subType: 2, sClass: 'V', mass: 1, lum: 1, temp: 5800, role: 'Primary' };
            const state = { type: 'SYSTEM_PRESENT', name: 'Harbor', mgt2eData: { ...world }, notes: 'Existing referee notes',
                mgtSystem: { stars: [star], worlds: [world, { ...world, name: 'Outer Reach', type: 'Terrestrial Planet', au: 3, orbitId: 5 }], mainworld: world },
                gasGiantCount: 0, beltCount: 0 };
            window.atlasFixture = JSON.parse(JSON.stringify(state));
            hexStates.set('1-A-0101', state);
            hexStates.set('1-A-0201', { type: 'SYSTEM_PRESENT', name: 'Waypoint', mgt2eData: { ...world, name: 'Waypoint' } });
            const c = getHexCoords('1-A-0101'), p = getHexPixel(c.q, c.r);
            zoom = 1; cameraX = p.x - 800; cameraY = p.y - 420;
            draw();
        });
        await page.mouse.click(800, 420);
        check('click opens system tray without changing bulk selection', await evalIn(() => SystemInspector.currentHexId() === '1-A-0101' && SystemInspector.isOpen() && selectedHexes.size === 0));
        await page.mouse.dblclick(800, 420);
        check('double click opens exact system in orbit view', await evalIn(() => SystemViewer.currentHexId() === '1-A-0101'));
        check('orbit rings are enabled by default', await page.locator('#sv-show-orbits').isChecked());
        await page.locator('#sv-show-orbits').uncheck();
        await page.locator('#sv-show-orbits').check();
        await page.locator('.atlas-body-row').filter({ hasText: 'Outer Reach' }).click();
        check('body selection displays persistent details', await page.locator('#atlas-content h2').innerText() === 'Outer Reach');
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.waitForTimeout(200);
        check('tray and orbit canvas fit together at 720px height', await evalIn(() => {
            const a = document.getElementById('system-inspector').getBoundingClientRect();
            const c = document.getElementById('orrery-canvas').getBoundingClientRect();
            return a.bottom <= innerHeight && c.left >= a.right && c.bottom <= innerHeight + 1;
        }));
        await page.screenshot({ path: path.join(root, '.tmp/atlas-orbits.png') });
        await page.getByRole('button', { name: 'Return to map', exact: true }).click();
        await page.locator('#atlas-campaign-tab').click();
        await page.getByRole('button', { name: '+ Add record', exact: true }).click();
        await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Mara Venn');
        await page.getByRole('textbox', { name: 'Summary', exact: true }).fill('A mechanic at Harbor Downport');
        await page.getByRole('textbox', { name: 'Details', exact: true }).fill('ATLAS_PRIVATE_SENTINEL_180 <img src=x onerror=alert(1)>');
        await page.getByRole('textbox', { name: 'Location', exact: true }).fill('Harbor / Downport');
        await page.getByRole('textbox', { name: 'Tags (comma separated)', exact: true }).fill('Mechanic, mechanic, Contact');
        await page.getByRole('button', { name: 'Save record', exact: true }).click();
        await page.waitForFunction(() => !CampaignAtlas.hasDraft());
        check('record form commits and normalizes tags', await evalIn(() => {
            const r = CampaignAtlas.recordsForHex('1-A-0101')[0];
            window.testRecordId = r.id;
            return r.name === 'Mara Venn' && r.tags.join(',') === 'mechanic,contact' && r.visibility === 'referee';
        }));
        check('record text is rendered as plain text', await page.locator('#atlas-content img').count() === 0);
        await undo();
        check('undo record creation', await evalIn(() => CampaignAtlas.recordsForHex('1-A-0101').length === 0));
        await undo(true);
        check('redo record creation', await evalIn(() => CampaignAtlas.recordsForHex('1-A-0101').length === 1));

        const png = await evalIn(async () => {
            const c = document.createElement('canvas'); c.width = 100; c.height = 160;
            const ctx = c.getContext('2d'); ctx.fillStyle = '#af467f'; ctx.fillRect(15, 10, 70, 140);
            return c.toDataURL('image/png').split(',')[1];
        });
        await page.getByRole('button', { name: 'Edit record', exact: true }).click();
        await page.getByLabel('Add images', { exact: true }).setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
        await page.waitForSelector('.atlas-gallery-item');
        check('image draft remains editable after decoding', await page.getByRole('button', { name: 'Save record', exact: true }).isEnabled());
        await page.getByRole('textbox', { name: 'Alt text', exact: true }).fill('ATLAS_PRIVATE_PORTRAIT');
        await page.getByRole('button', { name: 'Save record', exact: true }).click();
        await page.waitForFunction(() => !CampaignAtlas.hasDraft());
        check('image commit stores immutable bytes separately', await evalIn(async () => {
            const r = campaignAtlas.records[testRecordId];
            window.testAssetId = r.primaryImageId;
            const p = await dbManager.readCampaignAsset(testAssetId);
            return p.display instanceof Blob && r.images.length === 1 && !JSON.stringify(undoStack).includes('base64');
        }));
        await undo();
        check('undo image attachment restores empty gallery', await evalIn(() => campaignAtlas.records[testRecordId].images.length === 0));
        await undo(true);
        check('redo recovers image pixels', await evalIn(async () => {
            const p = await CampaignAssets.read(campaignAtlas.records[testRecordId].primaryImageId);
            const image = await createImageBitmap(p.display); const ok = image.width === 100 && image.height === 160; image.close(); return ok;
        }));
        await evalIn(async () => {
            window.testBackup = { version: APP_VERSION, gridWidth, gridHeight, hexStates: Object.fromEntries(hexStates),
                ...await CampaignAtlas.exportMap(), routeDefinitions: [], sectorNames: { 1: 'Atlas test' } };
            window.systemBackup = { exportType: 'asab-system', sourceHexId: '1-A-0101', state: hexStates.get('1-A-0101'), ...await CampaignAtlas.exportForHex('1-A-0101') };
        });
        check('serialized image budget matches encoded dictionary exactly', await evalIn(() => CampaignAssets.serializedSize(campaignAtlas) === new TextEncoder().encode(JSON.stringify(testBackup.campaignAssets)).length));
        check('multipart carries all metadata once and respects byte limits', await evalIn(() => {
            const save = JSON.parse(JSON.stringify(testBackup));
            for (let i = 0; i < 14; i++) save.hexStates[`2-A-${String(i + 1).padStart(4, '0')}`] = { type: 'EMPTY', notes: '界'.repeat(180) };
            const parts = partitionMapSave(save, 4500);
            const merged = combineMapParts(parts);
            return parts.length > 1 && parts.every(p => new TextEncoder().encode(JSON.stringify(p)).length <= 4500) &&
                parts.filter(p => p.campaignAssets).length === 1 && JSON.stringify(merged.campaignAssets) === JSON.stringify(save.campaignAssets) && merged.sectorNames[1] === 'Atlas test';
        }));
        check('future schemas reject without changing live map or history', await evalIn(async () => {
            const before = JSON.stringify(campaignAtlas), count = undoStack.length;
            try { await applyLoadedMapData({ ...testBackup, campaignAtlas: { schemaVersion: 999 } }); return false; }
            catch (_) { return before === JSON.stringify(campaignAtlas) && count === undoStack.length; }
        }));
        check('missing image payload rejects before mutation', await evalIn(async () => {
            const before = JSON.stringify(campaignAtlas);
            try { await applyLoadedMapData({ ...testBackup, campaignAssets: {} }); return false; }
            catch (_) { return before === JSON.stringify(campaignAtlas); }
        }));
        check('system import rewrites anchors and remaps collisions', await evalIn(async () => {
            await importSystemJson(systemBackup, '1-A-0201', 'merge');
            const old = campaignAtlas.records[testRecordId], imported = CampaignAtlas.recordsForHex('1-A-0201')[0];
            return imported.id !== old.id && imported.primaryImageId !== old.primaryImageId && imported.name === old.name && imported.anchor.hexId === '1-A-0201';
        }));
        check('system-only import keeps target campaign records', await evalIn(async () => {
            const before = JSON.stringify(CampaignAtlas.recordsForHex('1-A-0201'));
            await importSystemJson(systemBackup, '1-A-0201', 'system-only');
            return before === JSON.stringify(CampaignAtlas.recordsForHex('1-A-0201'));
        }));
        check('map image round trip restores active records and bytes', await evalIn(async () => {
            await applyLoadedMapData(testBackup);
            const r = CampaignAtlas.recordsForHex('1-A-0101')[0];
            return r.name === 'Mara Venn' && (await CampaignAssets.read(r.primaryImageId)).display.size > 0 && CampaignAtlas.recordsForHex('1-A-0201').length === 0;
        }));
        check('records survive generated state replacement', await evalIn(() => {
            const before = JSON.stringify(campaignAtlas);
            hexStates.set('1-A-0101', { type: 'EMPTY' });
            hexStates.set('1-A-0101', JSON.parse(JSON.stringify(atlasFixture)));
            return before === JSON.stringify(campaignAtlas);
        }));
        await evalIn(async () => { await dbManager.syncAllHexes(); await CampaignAtlas.persist(); });
        await page.reload();
        await page.waitForFunction(() => window.CampaignAtlas && document.getElementById('atlas-title').textContent);
        await page.locator('#btn-launch-app').click();
        await page.locator('#splash-screen').waitFor({ state: 'hidden' });
        check('browser restart restores campaign records and images', await evalIn(async () => {
            const r = CampaignAtlas.recordsForHex('1-A-0101')[0];
            return r?.name === 'Mara Venn' && (await CampaignAssets.read(r.primaryImageId)).display instanceof Blob;
        }));
        await evalIn(() => CampaignAtlas.openForHex('1-A-0101'));
        await page.screenshot({ path: path.join(root, '.tmp/atlas-campaign.png') });
        check('all browser scripts run without errors', errors.length === 0);
        console.log(`\n${checks.length} checks passed.`);
    } catch (err) {
        await page.screenshot({ path: path.join(root, '.tmp/atlas-failure.png') });
        console.error('BROWSER ERRORS', errors);
        throw err;
    } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
