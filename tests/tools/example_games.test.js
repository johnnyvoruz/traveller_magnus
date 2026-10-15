import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readGames, rowsOf, applySql, removeSql } from '../../tools/examples/seed_games.mjs';

const GAME = {
    game: "Test's Game", referee: 'test_referee', showReferee: false, clockDays: 403400,
    ships: [{ name: 'Hull', crew: ['A', 'B'], legs: [
        { from: 'Spinward_Marches/1910', to: 'Spinward_Marches/2005', departs: 403380, arrives: 403387 },
        { from: 'Spinward_Marches/2005', to: 'Spinward_Marches/1910', departs: 403390, arrives: 403450 },
    ] }],
    journal: [{ title: 'Log', body: 'Text.', when: { year: 1105, day: 100 } }],
};

test('a game file that fails the shape is refused with the file and the field', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'games-'));
    try {
        writeFileSync(path.join(dir, 'one.json'), JSON.stringify(GAME));
        assert.equal(readGames(dir).length, 1);
        writeFileSync(path.join(dir, 'two.json'), JSON.stringify(GAME));
        assert.throws(() => readGames(dir), /two\.json: referee \(repeats another game\)/);
        writeFileSync(path.join(dir, 'two.json'), JSON.stringify({ ...GAME, referee: 'other_ref', ships: [] }));
        assert.throws(() => readGames(dir), /two\.json: ships: Invalid/);
        writeFileSync(path.join(dir, 'two.json'), JSON.stringify({ ...GAME, referee: 'No Spaces' }));
        assert.throws(() => readGames(dir), /two\.json: referee \(/, 'judgeUsername rule');
        writeFileSync(path.join(dir, 'two.json'), JSON.stringify({ ...GAME, referee: 'a'.repeat(25) }));
        assert.throws(() => readGames(dir), /two\.json: referee \(/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('Lane C twelve games pass the checks', () => {
    const games = readGames(path.resolve('tools/examples/games'));
    assert.equal(games.length, 12);
});

test('rows come from B\'s functions, are the same every run, and leave out a leg still underway', async () => {
    const a = await rowsOf({ slug: 'one', ...GAME }, '1.2.0');
    const b = await rowsOf({ slug: 'one', ...GAME }, '1.2.0');
    assert.deepEqual(a, b);
    assert.equal(a.ships.length, 1);
    assert.match(a.ships[0].mark, /^pm_[0-9A-Z]{26}$/);
    assert.deepEqual(a.ships[0].aboard, ['A', 'B']);
    assert.equal(a.ships[0].legs.length, 1, 'the second leg arrives after the clock');
    assert.equal(`${a.ships[0].sector}/${a.ships[0].local}`, 'Spinward_Marches/2005', 'a jump underway stands at its from end');
    const sql = applySql(GAME, a);
    assert.match(sql, /public_games, example, show_referee\)\nVALUES .*'Test''s Game'.*, 1, 1, 0\)/);
    assert.doesNotMatch(sql, /INSERT INTO session|passkey/);
});

test('remove follows B\'s order and spares an account that still owns a universe', () => {
    const sql = removeSql(['u1']);
    const lines = sql.trim().split('\n');
    assert.equal(lines[0], 'DELETE FROM universes WHERE example = 1;');
    assert.match(lines[1], /^DELETE FROM profile WHERE user_id = 'u1' AND NOT EXISTS/);
    assert.match(lines[2], /^DELETE FROM generation_allowance/);
    assert.match(lines[3], /^DELETE FROM user WHERE id = 'u1' AND NOT EXISTS/);
});