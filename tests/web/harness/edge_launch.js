/**
 * CF3: one headless Edge per test, on its own profile under the OS temp folder.
 * The launch waits 30 seconds. The caller skips when Edge does not start, and
 * deletes the profile when the test ends.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export function loadPlaywright() {
    try {
        return createRequire(path.join(root, '.tmp/atlas-testing/package.json'))('playwright');
    } catch {
        return null;
    }
}

export function edgeProfile(prefix) {
    return fs.mkdtempSync(path.join(tmpdir(), prefix));
}

/** A persistent context. Its profile is profileDir, not a shared Edge profile. */
export async function launchEdge(profileDir) {
    const playwright = loadPlaywright();
    if (!playwright) {
        const error = new Error('Playwright is not installed in .tmp/atlas-testing');
        error.code = 'NO_PLAYWRIGHT';
        throw error;
    }
    return playwright.chromium.launchPersistentContext(profileDir, {
        channel: 'msedge',
        headless: true,
        timeout: 30000,
        deviceScaleFactor: 1,
        viewport: { width: 1280, height: 720 },
    });
}

export function edgeSkipReason(error) {
    if (error && error.code === 'NO_PLAYWRIGHT') return error.message;
    const line = String((error && error.message) || error).split('\n')[0];
    return 'Edge could not be started headless: ' + line;
}

/**
 * Deletes the profile. Edge can hold its files for a few seconds after the context closes (EPERM),
 * so it retries for about five seconds; a folder still held then stays in the OS temp folder with a
 * warning, and the test that used it keeps its result.
 */
export function removeProfile(dir) {
    if (!dir) return;
    try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
    } catch (error) {
        console.warn('Edge still holds its test profile; left in the temp folder: ' + dir + ' (' + (error && error.code) + ')');
    }
}
