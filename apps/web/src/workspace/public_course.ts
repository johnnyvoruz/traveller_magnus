/**
 * The referee's course switch (prompts/d_store_2.md item 4b; contracts/b_public_games.md, "Course
 * ahead (0020)"): whether the public cards of this game show where its ships are going. It sits
 * beside "Show my name on public cards" and shows while public is on. On by default. The write is
 * `PATCH /api/universes/:id/public-games` with `{ public: true, showCourse }`; the server rewrites
 * the cards before it answers, so an open card is fetched again (`courseWrites`).
 *
 * A universe with no `showCourse` key is a server before 0020: the switch shows on and cannot be
 * changed, with "Available after the next update." A 503 `course_unavailable` says the server's
 * sentence by the switch.
 */
import { reactive } from 'vue';
import { apiFetch } from '../platform/http.ts';

export const COURSE_LABEL = 'Publish my ships’ course';
export const COURSE_LATER = 'Available after the next update.';
const NOT_SAVED = 'The setting could not be saved. Try again.';
const NOT_REACHED = 'The server could not be reached. Try again.';

/** The switch's answer, by universe. */
const saved = reactive<Record<string, boolean>>({});

/** Counts the course writes that were saved: the map fetches an open card again when it changes. */
export const courseWrites = reactive({ count: 0 });

export type CourseSwitch = { on: boolean; available: boolean };

/**
 * The switch, or null to hide it (public is off). `available` is false on a server before 0020,
 * where the course is treated as on and cannot be changed.
 */
export function showCourseOf(universe: { id: string; showCourse?: boolean } | null, publicOn: boolean | null): CourseSwitch | null {
    if (!universe || publicOn !== true) return null;
    if (universe.id in saved) return { on: saved[universe.id], available: true };
    if (typeof universe.showCourse !== 'boolean') return { on: true, available: false };
    return { on: universe.showCourse, available: true };
}

export type CourseResult = { ok: true; showCourse: boolean } | { ok: false; message: string; unavailable: boolean };

export async function setShowCourse(id: string, on: boolean, fetchImpl: typeof fetch = fetch): Promise<CourseResult> {
    let res: Response;
    try {
        res = await apiFetch(fetchImpl, '/api/universes/' + encodeURIComponent(id) + '/public-games', {
            method: 'PATCH',
            body: JSON.stringify({ public: true, showCourse: on }),
        });
    } catch {
        return { ok: false, message: NOT_REACHED, unavailable: false };
    }
    const body = await res.json().catch(() => null) as { showCourse?: unknown; error?: { code?: unknown; message?: unknown } } | null;
    if (res.ok && body && typeof body.showCourse === 'boolean') {
        saved[id] = body.showCourse;
        courseWrites.count += 1;
        return { ok: true, showCourse: body.showCourse };
    }
    const said = body && body.error && typeof body.error.message === 'string' ? body.error.message : '';
    const unavailable = res.status === 503 && !!body && !!body.error && body.error.code === 'course_unavailable';
    return { ok: false, message: said || NOT_SAVED, unavailable };
}

/** Tests start clean. */
export function _forgetCourse(): void {
    for (const key of Object.keys(saved)) delete saved[key];
    courseWrites.count = 0;
}
