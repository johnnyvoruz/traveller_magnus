/**
 * The referee's course switch (prompts/d_store_2.md item 4b; contracts/b_public_games.md, "Course
 * ahead (0020)"): beside "Show my name on public cards", on by default, shown while public is on,
 * on and fixed before 0020, the server's sentence on a 503, and an open card fetched again.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { beforeEach, test } from 'node:test';
import { _forgetCourse, COURSE_LABEL, COURSE_LATER, courseWrites, setShowCourse, showCourseOf } from '../../apps/web/src/workspace/public_course.ts';

const read = (file) => readFileSync(new URL('../../apps/web/src/' + file, import.meta.url), 'utf8');

function answer(status, body, calls) {
    return async (url, init) => {
        calls.push({ url: String(url), method: init.method, body: JSON.parse(init.body) });
        return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    };
}

beforeEach(() => { _forgetCourse(); });

test('the switch: hidden while public is off, on and fixed before 0020, else what the universe says', () => {
    assert.equal(showCourseOf(null, true), null);
    assert.equal(showCourseOf({ id: 'uni_a', showCourse: true }, false), null);
    assert.equal(showCourseOf({ id: 'uni_a', showCourse: true }, null), null);
    assert.deepEqual(showCourseOf({ id: 'uni_a' }, true), { on: true, available: false });
    assert.deepEqual(showCourseOf({ id: 'uni_a', showCourse: true }, true), { on: true, available: true });
    assert.deepEqual(showCourseOf({ id: 'uni_a', showCourse: false }, true), { on: false, available: true });
    assert.equal(COURSE_LABEL, 'Publish my ships’ course');
    assert.equal(COURSE_LATER, 'Available after the next update.');
});

test('a write sends { public: true, showCourse }, keeps the answer, and counts a write for the map', async () => {
    const calls = [];
    const done = await setShowCourse('uni_a', false, answer(200, { public: true, showReferee: false, showCourse: false }, calls));
    assert.deepEqual(done, { ok: true, showCourse: false });
    assert.deepEqual(calls, [{ url: '/api/universes/uni_a/public-games', method: 'PATCH', body: { public: true, showCourse: false } }]);
    assert.deepEqual(showCourseOf({ id: 'uni_a', showCourse: true }, true), { on: false, available: true });
    assert.equal(courseWrites.count, 1);
});

test('a 503 course_unavailable is the server\'s sentence, and nothing is kept', async () => {
    const calls = [];
    const refused = await setShowCourse('uni_a', false, answer(503, { ok: false, error: { code: 'course_unavailable', message: 'The course switch is not available yet.' } }, calls));
    assert.deepEqual(refused, { ok: false, message: 'The course switch is not available yet.', unavailable: true });
    assert.deepEqual(showCourseOf({ id: 'uni_a', showCourse: true }, true), { on: true, available: true });
    assert.equal(courseWrites.count, 0);
    const lost = await setShowCourse('uni_a', false, async () => { throw new TypeError('offline'); });
    assert.deepEqual(lost, { ok: false, message: 'The server could not be reached. Try again.', unavailable: false });
});

test('the menu puts it after the name switch, says why it is fixed or refused, and the map fetches an open card again', () => {
    // DU10: the switches are on the Campaigns panel's card now.
    const menu = read('workspace/CampaignsPanel.vue');
    const name = menu.indexOf('data-command="show-referee"');
    const course = menu.indexOf('data-command="show-course"');
    assert.ok(name > 0 && course > name, 'beside "Show my name on public cards"');
    assert.match(menu, /:disabled="busy \|\| !showCourse\.available"/);
    assert.match(menu, /<p v-if="openOne && showCourse && courseTrouble" id="account-course-say" class="account-say is-todo" role="alert" data-course-trouble>\{\{ courseTrouble \}\}<\/p>/);
    assert.match(menu, /<p v-else-if="openOne && showCourse && !showCourse.available" id="account-course-say" class="account-say" data-course-later>\{\{ COURSE_LATER \}\}<\/p>/);
    const view = read('views/MapView.vue');
    assert.match(view, /watch\(\(\) => courseWrites\.count, \(\) => \{\s*const now = shipSheet\.value;\s*if \(now\) void showShip\(now\.index, now\.place, null\);/);
});
