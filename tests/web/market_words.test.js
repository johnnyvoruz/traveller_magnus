/**
 * DT10 (streams/D.md): Markets nearby, made readable. The facts line ("Trade number"), the trade codes as
 * pills with the names from `dossier/labels.ts` (a code the table does not name keeps its code), the owner
 * code as a sentence, and the row's layout pinned (the distance beside the name block, centred).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { tradeCodeName } from '../../apps/web/src/dossier/labels.ts';
import { codeWords, factsLine, ownerHex, ownerLine } from '../../apps/web/src/workspace/market_words.ts';

const webSrc = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../apps/web/src');

test('the facts line: Starport and Pop stay, WTN reads Trade number, nothing unread said', () => {
    assert.equal(factsLine({ starport: 'C', wtn: 8, population: '7' }), 'Starport C · Trade number 8 · Pop 7');
    assert.equal(factsLine({ starport: 'A', wtn: null, population: '' }), 'Starport A');
    assert.equal(factsLine({ starport: '', wtn: 0, population: '3' }), 'Starport ? · Trade number 0 · Pop 3');
});

test('the code words: the table\'s names, an unnamed code kept, the code itself for the title', () => {
    assert.equal(tradeCodeName('Ag'), 'Agricultural');
    assert.equal(tradeCodeName('Ni'), 'Non-Industrial');
    assert.equal(tradeCodeName('Va'), 'Vacuum');
    assert.equal(tradeCodeName('Cp'), null, 'not in the table: no name made up');
    const none = () => null;
    assert.deepEqual(codeWords(['Ag', ' Ni ', 'Cp', ''], none).pills, [
        { code: 'Ag', label: 'Agricultural' }, { code: 'Ni', label: 'Non-Industrial' }, { code: 'Cp', label: 'Cp' },
    ]);
});

test('the owner line: the world named from the index, else the hex; the owner is not a pill', () => {
    const nameAt = (hex) => (hex === '0431' ? 'Khakkakum' : null);
    assert.equal(ownerHex('O:0431'), '0431');
    assert.equal(ownerHex('Ag'), null);
    assert.equal(ownerLine('O:0431', nameAt), 'Owned by Khakkakum (0431)');
    assert.equal(ownerLine('O:0999', nameAt), 'Owned by 0999');
    assert.equal(ownerLine('O:Vlan-0431', nameAt), 'Owned by Vlan-0431', 'another sector\'s form: said as written');
    const words = codeWords(['Ni', 'O:0431'], nameAt);
    assert.deepEqual(words.pills, [{ code: 'Ni', label: 'Non-Industrial' }]);
    assert.deepEqual(words.owners, ['Owned by Khakkakum (0431)']);
});

test('the row: pills in the house chip with the code as title, the owner line, the distance beside the name block', () => {
    const rows = fs.readFileSync(path.join(webSrc, 'workspace/MarketsRows.vue'), 'utf8');
    assert.match(rows, /class="ui-chip mkt-code" :title="pill\.code" data-market-code>\{\{ pill\.label \}\}</);
    assert.match(rows, /class="mkt-owner" data-market-owner>\{\{ owner \}\}</);
    assert.match(rows, /<\/span>\s+<span class="mkt-pc">\{\{ parsecWords\(row\.parsecs\) \}\}<\/span>\s+<\/button>/, 'the distance is the row\'s second column');
    assert.match(rows, /\.mkt-row \{[^}]*display: grid;[^}]*grid-template-columns: minmax\(0, 1fr\) auto;[^}]*align-items: center;/);
    assert.doesNotMatch(rows, /'WTN '/);
    assert.doesNotMatch(rows, /#[0-9a-f]{3,6}\b/i);
});
