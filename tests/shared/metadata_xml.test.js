import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMetadataXml } from '@voyage/shared';

/**
 * Hand count of universe/raw/Spinward_Marches.xml (10184 bytes), 2026-10-03.
 * Method: count opening tags `<Route` and `<Border` (element names). The stylesheet
 * text uses lowercase `border.` and `route.` and is not an element, so it is not
 * counted. CDATA in Credits contains `<b>` and `<cite>` only.
 *   <Route .../>  → 127
 *   <Border ...>  → 7
 *   <Allegiance>  → 8
 *   <Subsector>   → 16
 * Coordinates are the Sector elements <X>-4</X> and <Y>-1</Y>. Milieu is the
 * DataFile Milieu attribute M1105. No legacy parse_metadata_xml fixture exists
 * (that case stays skipped: the oracle has no DOMParser).
 */
const XML = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../universe/raw/Spinward_Marches.xml');
const ROUTES = 127;
const BORDERS = 7;

test('Spinward Marches metadata counts', () => {
    const text = fs.readFileSync(XML, 'utf8');
    assert.equal((text.match(/<Route\b/g) || []).length, ROUTES);
    assert.equal((text.match(/<Border\b/g) || []).length, BORDERS);
    const meta = parseMetadataXml(text);
    assert.equal(meta.routes.length, ROUTES);
    assert.equal(meta.borders.length, BORDERS);
    assert.equal(meta.allegiances.length, 8);
    assert.equal(Object.keys(meta.names).length, 16);
    assert.equal(meta.names.C, 'Regina');
    assert.equal(meta.name, 'Spinward Marches');
    assert.equal(meta.x, -4);
    assert.equal(meta.y, -1);
    assert.equal(meta.milieu, 'M1105');
    assert.equal(meta.routes[0].Start, '1106');
    assert.equal(meta.routes[0].End, '1006');
    assert.equal(meta.borders[0].Allegiance, 'DaCf');
    assert.ok(meta.borders[0].path.startsWith('0223'));
});
