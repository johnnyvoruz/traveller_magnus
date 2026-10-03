import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { routeColour, routeStylesheetRules, assembleSectorIndex } from '@voyage/generation';

const RAW = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../universe/raw');

test('own colour wins over a stylesheet rule and the table', () => {
    const rules = routeStylesheetRules('route.ZhCo { color: red }');
    assert.equal(routeColour({ Allegiance: 'ZhCo', Color: 'purple' }, rules), 'purple');
});

test('a stylesheet rule beats the built-in table', () => {
    const rules = routeStylesheetRules('route.ZhCo { color: red }');
    assert.equal(routeColour({ Allegiance: 'ZhCo' }, rules), 'red');
    assert.equal(routeStylesheetRules('route.ZhCo { color: lightblue }').get('ZhCo'), 'lightblue');
});

test('the table is used when the stylesheet has no rule', () => {
    assert.equal(routeColour({ Allegiance: 'Im' }, routeStylesheetRules('')), '#048104');
    assert.equal(routeColour({ Allegiance: 'ZhCo' }, new Map()), 'lightblue');
    assert.equal(routeColour({ Allegiance: 'Core Route' }, new Map()), 'purple');
});

test('no allegiance returns an empty colour', () => {
    assert.equal(routeColour({ Start: '0101', End: '0102' }, routeStylesheetRules('route.Im { color: red }')), '');
});

test('an unknown allegiance returns an empty colour', () => {
    assert.equal(routeColour({ Allegiance: 'Nope' }, routeStylesheetRules('route.Im { color: red }')), '');
});

test('Spinward Marches routes keep resolvedColor only when one was found', () => {
    const xml = fs.readFileSync(path.join(RAW, 'Spinward_Marches.xml'), 'utf8');
    const index = assembleSectorIndex({ slug: 'Spinward_Marches', version: 'v3', metadataXml: xml, hexes: {} });
    const sw = index.metadata.routes.filter(route => route.Allegiance === 'SwCf');
    const plain = index.metadata.routes.filter(route => !route.Allegiance);
    assert.ok(sw.length > 0);
    assert.ok(sw.every(route => route.resolvedColor === '#006600'));
    assert.ok(plain.length > 0);
    assert.ok(plain.every(route => !Object.hasOwn(route, 'resolvedColor')));
});
