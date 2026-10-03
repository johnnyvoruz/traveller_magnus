import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { formatDisplayNumber, formatTradeCodes, formatUwpDigit } from '@voyage/engines';
import {
    formatDisplayNumber as webNumber,
    formatTradeCodes as webCodes,
    formatUwpDigit as webDigit,
} from '../../apps/web/src/dossier/labels.ts';

const src = fs.readFileSync(fileURLToPath(new URL('../../packages/engines/src/universal_math.js', import.meta.url)), 'utf8');

function tableKeys(name) {
    const match = src.match(new RegExp('const ' + name + ' = \\{([\\s\\S]*?)\\n    \\};'));
    assert.ok(match, name);
    const keys = [];
    for (const hit of match[1].matchAll(/(?:^|[{,\n])\s*([0-9A-Za-z]+)\s*:/g)) keys.push(hit[1]);
    assert.ok(keys.length > 0, name);
    return keys;
}

const KINDS = {
    STARPORT_NAMES: 'starport',
    SIZE_NAMES: 'size',
    ATMOSPHERE_NAMES: 'atmosphere',
    HYDRO_NAMES: 'hydrographics',
    POPULATION_NAMES: 'population',
    GOVERNMENT_NAMES: 'government',
};

const SAMPLES = ['?', '', undefined, 'ZZ'];

test('display names match the engine for every table key and the empty values', () => {
    for (const [table, kind] of Object.entries(KINDS)) {
        for (const key of tableKeys(table)) {
            assert.equal(webDigit(kind, key), formatUwpDigit(kind, key), kind + ' ' + key);
            if (/^\d+$/.test(key)) {
                assert.equal(webDigit(kind, Number(key)), formatUwpDigit(kind, Number(key)), kind + ' number ' + key);
            }
        }
        for (const value of SAMPLES) {
            assert.equal(webDigit(kind, value), formatUwpDigit(kind, value), kind + ' sample');
        }
    }
    for (const key of tableKeys('TRADE_CODE_NAMES')) {
        assert.equal(webCodes(key), formatTradeCodes(key), key);
        assert.equal(webCodes([key]), formatTradeCodes([key]), key + ' list');
    }
    for (const value of SAMPLES) {
        assert.equal(webCodes(value), formatTradeCodes(value), 'trade sample');
        assert.equal(webDigit('law', value), formatUwpDigit('law', value), 'law sample');
        assert.equal(webNumber(value), formatDisplayNumber(value), 'number sample');
    }
    assert.equal(webCodes('Ag Ni ZZ'), formatTradeCodes('Ag Ni ZZ'));
    assert.equal(webNumber(1.234, 2), formatDisplayNumber(1.234, 2));
    assert.equal(webNumber(0.0001, 2, 'AU'), formatDisplayNumber(0.0001, 2, 'AU'));
    assert.equal(webNumber(0, 0, 'K'), formatDisplayNumber(0, 0, 'K'));
});
