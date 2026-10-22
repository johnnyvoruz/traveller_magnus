/**
 * /help (streams/E.md E1): the guide names the real controls, the route stays on the map,
 * and Help is a command.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { targetFor } from '../../apps/web/src/map/routes.ts';
import { NEWS_PARAMS } from '../../apps/web/src/news/params.ts';
import { COURSE_LABEL } from '../../apps/web/src/workspace/public_course.ts';
import { PUBLIC_GAMES_LABEL } from '../../apps/web/src/workspace/public_games.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');
const cacheDir = path.join(root, '.tmp', 'e-help-ssr');

test('the map keeps /help, and Help is a command', () => {
    const router = fs.readFileSync(path.join(webRoot, 'src', 'router.ts'), 'utf8');
    assert.match(router, /path: '\/help', name: 'help', component: \(\) => import\('\.\/views\/HelpView\.vue'\)/);
    const view = fs.readFileSync(path.join(webRoot, 'src', 'views', 'HelpView.vue'), 'utf8');
    assert.match(view, /<MapView \/>/);
    assert.match(view, /<HelpWindow @close="leave" \/>/);
    assert.match(view, /router\.replace\('\/'\)/);
    const registry = fs.readFileSync(path.join(webRoot, 'src', 'shell', 'registry.ts'), 'utf8');
    assert.match(registry, /offerHelp\(registerCommand\)/);
    const command = fs.readFileSync(path.join(webRoot, 'src', 'workspace', 'help_command.ts'), 'utf8');
    assert.match(command, /name: 'Help'/);
    assert.match(command, /'\/help'/);
    const body = fs.readFileSync(path.join(webRoot, 'src', 'workspace', 'ChangelogBody.vue'), 'utf8');
    assert.match(body, /href="\/help"/);
    const manifest = { sectors: [{ slug: 'Spinward_Marches', x: 0, y: 0, tags: ['OTU'], canonical: true }] };
    assert.deepEqual(targetFor({ path: '/help' }, manifest).kind, targetFor({ path: '/' }, manifest).kind);
});

describe('rendered', { concurrency: 1 }, () => {
    /** @type {import('vite').ViteDevServer | null} */
    let server = null;

    test.before(async () => {
        fs.rmSync(cacheDir, { recursive: true, force: true });
        const { createServer } = await import('vite');
        server = await createServer({
            root: webRoot,
            cacheDir,
            server: { middlewareMode: true, hmr: false, ws: false },
            appType: 'custom',
            logLevel: 'silent',
        });
    });

    test.after(async () => {
        if (server) await server.close();
        fs.rmSync(cacheDir, { recursive: true, force: true });
    });

    test('the guide renders its sections on a cold load', async () => {
        const component = (await server.ssrLoadModule('/src/workspace/HelpGuide.vue')).default;
        const { createSSRApp } = await import('vue');
        const { renderToString } = await import('vue/server-renderer');
        const html = await renderToString(createSSRApp(component));
        for (const heading of [
            'Start here',
            'Make records',
            'Publish records',
            'Publish part of your map',
            'Share a package',
            'Import a package',
            'Keys in a list',
            'Your ship on other people&#39;s maps',
            'Dice',
            'News',
            'System Comms',
            'Invite your players',
            'What players see',
        ]) {
            assert.match(html, new RegExp(heading));
        }
        assert.match(html, /Publish selection…/);
        assert.match(html, /Select hexes/);
        assert.match(html, new RegExp(PUBLIC_GAMES_LABEL));
        assert.match(html, new RegExp(COURSE_LABEL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        assert.match(html, /id="help-h"/);
        assert.match(html, /href="\/welcome"/);
        assert.match(html, /Get the invite link/);
        assert.match(html, /Select Copy, and send the address/);
        assert.match(html, /selects Join/);
        assert.match(html, /or Not yet/);
        assert.match(html, /For players/);
        assert.match(html, /the summary, the details/);
        assert.match(html, /images and their captions/);
        assert.match(html, /its role and its notes/);
        assert.match(html, /the kinds you set/);
        assert.match(html, /the place and the ships of the party/);
        assert.match(html, /the campaign date/);
        assert.match(html, /reads &quot;a record&quot;/);
        assert.match(html, /Select Dice on the rail/);
        assert.match(html, /How fast does news travel from here/);
        assert.match(html, /How old is the news here/);
        assert.match(html, /adds no wait/);
        assert.match(html, /System Comms sits beside Fit/);
        assert.match(html, /whether or not your ship is there/);
        assert.match(html, /Quiet on this device/);
        assert.match(html, /leaves System Comms as it is/);
        assert.match(html, /Bring in a session/);
        assert.match(html, /Ask every player before you record/);
        assert.match(html, /Copy for your AI/);
        assert.match(html, /voyage-session-ingest skill from the skill folder/);
        assert.match(html, /No AI runs here/);
        assert.match(html, /Paste your AI&#39;s reply/);
        assert.match(html, /A token reaches this one campaign only/);
        assert.equal(html.toLowerCase().includes('snapshot'), false);
        assert.match(html, /Lower DM and Raise DM/);
        assert.match(html, /Boon keeps the best two of three dice/);
        assert.match(html, /Bane keeps the worst two/);
        assert.match(html, /D66 reads the first die as tens/);
        assert.equal(html.includes('To avoid writing'), false);
    });
});

test('the dice section follows assets/dice_conventions.txt and does not quote it', () => {
    const guide = fs.readFileSync(path.join(webRoot, 'src', 'workspace', 'HelpGuide.vue'), 'utf8');
    const lines = fs.readFileSync(path.join(root, 'assets', 'dice_conventions.txt'), 'utf8').split(/\r?\n/);
    // Lines 6 to 13: 1D, 2D, and 3D mean that many six-sided dice, added.
    assert.match(lines.slice(5, 13).join('\n'), /roll 2D/);
    assert.match(lines.slice(5, 13).join('\n'), /add them together/);
    // Lines 14 to 18: a number after the dice is added to or subtracted from the total.
    assert.match(lines.slice(13, 18).join('\n'), /add or\s+subtract the number shown to the total rolled/);
    // Lines 19 to 26: D3 maps 1–2, 3–4, and 5–6; 2D3 does that to each die, then adds.
    assert.match(lines.slice(18, 26).join('\n'), /1–2 means one/);
    assert.match(lines.slice(18, 26).join('\n'), /2D3/);
    // Lines 27 to 32: D66, the first die the tens, a number from 11 to 66. The text gives D66 no DM.
    assert.match(lines.slice(26, 32).join('\n'), /tens/);
    assert.match(lines.slice(26, 32).join('\n'), /11 and 66/);
    assert.match(guide, /<h3>Dice<\/h3>/);
    assert.match(guide, /six-sided dice and add them/);
    assert.match(guide, /1 or 2 as 1, 3 or 4 as 2, and 5 or 6 as 3/);
    assert.match(guide, /does not use the DM/);
    // 3DD is not in that file. Johnny, 2026-10-18 15:54: roll 3D and multiply by 10. No DM.
    assert.match(guide, /3DD: Roll three dice, add them, and multiply by 10\. It takes no DM/);
    assert.match(guide, /Roll D66, Roll 3DD, Boon/);
    assert.equal(guide.includes('To avoid writing'), false);
    assert.equal(guide.includes('nominate one dice'), false);
    // Boon and Bane are not in that file. Johnny, 2026-10-17 15:15: "Boon rolls 3D keeps best two, bane keeps worst two."
    const roller = fs.readFileSync(path.join(webRoot, 'src', 'dice', 'roll.ts'), 'utf8');
    assert.match(roller, /Boon rolls 3D keeps best two, bane keeps worst two/);
    assert.match(guide, /Boon keeps the best two of three dice\. Bane keeps the worst two/);
    assert.equal(NEWS_PARAMS.horizonDays, 60);
    assert.equal(NEWS_PARAMS.stationHoldHours, 0);
    assert.match(guide, new RegExp('out to ' + NEWS_PARAMS.horizonDays + ' days'));
    assert.match(guide, /adds no wait/);
    assert.match(guide, /How fast does news travel from here/);
    assert.match(guide, /How old is the news here/);
});
