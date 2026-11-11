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
            'Playing solo',
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
            'Relationships',
            'Session',
            'Characters',
            'The journal',
            'The timeline',
            'Build',
            'Set for the selection',
            'The orbit view',
            'The system page',
            'The party',
            'The crew',
            'Set up the ship',
            'Ship&#39;s locker',
            'Find passengers and freight',
            'Trade here',
            'Move credits',
            'A player&#39;s ship',
            'Markets nearby',
            'Account',
            'The Marketplace',
            'What&#39;s new',
            'View as players',
            'The map',
            'Directions',
            'Save image',
            'Paint',
        ]) {
            assert.match(html, new RegExp(heading));
        }
        assert.match(html, /Publish selection…/);
        assert.match(html, /Select hexes/);
        assert.match(html, new RegExp(PUBLIC_GAMES_LABEL));
        assert.match(html, new RegExp(COURSE_LABEL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        assert.match(html, /id="help-h"/);
        assert.match(html, /href="\/welcome"/);
        assert.match(html, /You can run the campaign on your own/);
        assert.match(html, /name it under Name your campaign/);
        assert.match(html, /Select Add your ship/);
        assert.match(html, /Trade here, Find passengers and freight, and Markets nearby/);
        assert.match(html, /Select Set the date for the clock/);
        assert.match(html, /select New session or New note/);
        assert.match(html, /Leave Get the invite link, Players, and View as players until you want them/);
        assert.match(html, /Crew sits under Passengers/);
        assert.match(html, /select Add to the crew/);
        assert.match(html, /The Role starts as Captain when the crew is empty/);
        assert.match(html, /A character crews one ship at a time/);
        assert.match(html, /Select Permissions/);
        assert.match(html, /The Ledger, Trade, and The locker/);
        assert.match(html, /The referee alone: the sheet, Set up the ship, the owners and the payment, Players, the course and the clock/);
        assert.match(html, /names their role and ship/);
        assert.match(html, /A player sees the crew names and roles, and not the switches/);
        assert.match(html, /Set up the ship sits at the top/);
        assert.match(html, /Jump Drive Output, Manoeuvre Drive Output, Fuel Capacity, Cargo Capacity, Staterooms, Low Berths, Mortgage Cost, Maintenance Cost, Life Support Cost, Salary Cost, and Running Cost/);
        assert.match(html, /Select Edit to open it again/);
        assert.match(html, /Ship&#39;s locker sits after Cargo/);
        assert.match(html, /Select Add to the locker to add a row/);
        assert.match(html, /Select Move to, then a character/);
        assert.match(html, /select To the locker on an Equipment row/);
        assert.match(html, /Select Roll for passengers, type a number in Take, and select Take passengers/);
        assert.match(html, /Select Roll for freight, then Take the lot/);
        assert.match(html, /Select Is there mail\?, then Take the mail/);
        assert.match(html, /Select Fit to the sheet/);
        assert.match(html, /select Deliver once the ship has arrived, and Delivered late when it was late/);
        assert.match(html, /Select Disembark to let passengers off/);
        assert.match(html, /The book says what the rolls mean/);
        assert.match(html, /Trade here works when the ship is at a world/);
        assert.match(html, /Find a supplier or buyer, Find a black market supplier, or Find a supplier online/);
        assert.match(html, /Select See the goods on offer/);
        assert.match(html, /Under Sell from the hold, select Roll the sale price, then Sell/);
        assert.match(html, /Select Hire a local broker, or Hire a local broker or fixer/);
        assert.match(html, /Log it writes the sale into the journal/);
        assert.match(html, /Markets nearby lists the worlds within 2, 4, or 6 parsecs/);
        assert.match(html, /the same list is titled Markets/);
        assert.match(html, /Select 2 pc, 4 pc, or 6 pc/);
        assert.match(html, /Set for the selection is on the Build pane/);
        assert.match(html, /The boxes are Allegiance and Region/);
        assert.match(html, /One system reads Set for 1 hex/);
        assert.match(html, /3 of 5 hexes hold a system\. The others are left alone/);
        assert.match(html, /1 of 5 hexes holds a system/);
        assert.match(html, /To take it back, set the old value again/);
        assert.match(html, /under Ledger, select Move credits/);
        assert.match(html, /Choose To the ship or From the ship/);
        assert.match(html, /move the credits back/);
        assert.match(html, /Attach a Character to their sheet first/);
        assert.match(html, /You trade; the referee keeps time/);
        assert.match(html, /Nothing you do here moves the ship or the clock/);
        assert.match(html, /Acting as chooses who presses/);
        assert.match(html, /You cannot select Remove this lot, Remove this line, Roll a passenger, or Board/);
        assert.match(html, /You cannot type Fuel aboard or set Base fuel/);
        assert.match(html, /Select Locate to mark it on the chart/);
        assert.match(html, /you cannot make or use a token/);
        assert.match(html, /you cannot change anything while you look/);
        assert.match(html, /select Paint, or press P/);
        assert.match(html, /The rail lists Terrain, Accents, and Features/);
        assert.match(html, /Shift-click paints a line from the last hex/);
        assert.match(html, /Clear map puts every painted hex back/);
        assert.match(html, /Select Keep to save the painted map for everyone in this universe/);
        assert.match(html, /Select Save image on the chart, the system map, or the world map/);
        assert.match(html, /A4, Letter, A3, or Tabloid/);
        assert.match(html, /On paper is ink on white\. Full colour is colour on white/);
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
        assert.match(html, /Ask everyone when the players are in different places/);
        assert.match(html, /California, Delaware, Florida, Illinois, Maryland, Massachusetts, Montana, Nevada, New Hampshire, Pennsylvania, and Washington/);
        assert.match(html, /Michigan is contested/);
        assert.match(html, /Oregon and Missouri require everyone&#39;s agreement for an in-person conversation/);
        assert.match(html, /Connecticut and Nevada require it for a call/);
        assert.match(html, /Germany requires it, under section 201 of its criminal code/);
        assert.match(html, /New South Wales requires it/);
        assert.match(html, /Canada and United States federal law let one person in the conversation agree/);
        assert.match(html, /a private recording can fall under the household exemption/);
        assert.match(html, /Uploading that recording to a cloud service may not/);
        assert.match(html, /This is not legal advice/);
        assert.match(html, /Copy for your AI/);
        assert.match(html, /voyage-session-ingest skill from the skill folder/);
        assert.match(html, /No AI runs here/);
        assert.match(html, /Paste your AI&#39;s reply/);
        assert.match(html, /A token reaches this one campaign only/);
        assert.match(html, /When Agent access is paused/);
        assert.match(html, /one json block holding the batch/);
        assert.match(html, /A batch holds at most 200 proposals/);
        assert.match(html, /A batch is at most 256 KB/);
        assert.match(html, /<h3>Relationships<\/h3>/);
        assert.match(html, /Select Org chart/);
        assert.match(html, /<h3>Session<\/h3>/);
        assert.match(html, /Start a session/);
        assert.match(html, /<h3>Characters<\/h3>/);
        assert.match(html, /Share by link/);
        assert.match(html, /The book says what each box means/);
        assert.match(html, /<h3>The journal<\/h3>/);
        assert.match(html, /New session/);
        assert.match(html, /<h3>The timeline<\/h3>/);
        assert.match(html, /Only this ship/);
        assert.match(html, /<h3>Build<\/h3>/);
        assert.match(html, /Design by hand…/);
        assert.match(html, /<h3>The orbit view<\/h3>/);
        assert.match(html, /Explore orbits/);
        assert.match(html, /<h3>The system page<\/h3>/);
        assert.match(html, /world profile/);
        assert.match(html, /<h3>The party<\/h3>/);
        assert.match(html, /Move the party/);
        assert.match(html, /<h3>Account<\/h3>/);
        assert.match(html, /I lost my passkey/);
        assert.match(html, /<h3>The Marketplace<\/h3>/);
        assert.match(html, /Search packages/);
        assert.match(html, /<h3>What&#39;s new<\/h3>/);
        assert.match(html, /The full list/);
        assert.match(html, /<h3>View as players<\/h3>/);
        assert.match(html, /Stop viewing as players/);
        assert.match(html, /<h3>The map<\/h3>/);
        assert.match(html, /How to use the map/);
        assert.match(html, /<h3>Directions<\/h3>/);
        assert.match(html, /beside Save image and How to use the map/);
        assert.match(html, /Press d, or open the command palette and select Directions/);
        assert.match(html, /Regina, or Spinward Marches 1910/);
        assert.match(html, /Use selected under From or under To/);
        assert.match(html, /Select a system on the chart first/);
        assert.match(html, /Swap From and To/);
        assert.match(html, /Jump-1 through Jump-6/);
        assert.match(html, /it starts on Jump-2/);
        assert.match(html, /Fuel starts on Any fuel, and it also lists Starport only and Refined only/);
        assert.match(html, /Fuel scoops, Fuel processors, or Allow Red zones/);
        assert.match(html, /Use Kestrel Dawn&#39;s jump \(Jump-2\)/);
        assert.match(html, /with that ship&#39;s name and its jump/);
        assert.match(html, /searches only the sectors loaded on the chart/);
        assert.match(html, /type more of the name/);
        assert.match(html, /Select Get directions/);
        assert.match(html, /one line for each leg/);
        assert.match(html, /Select Clear to drop the route/);
        assert.match(html, /Nothing is saved; closing Directions clears the route/);
        assert.match(html, /Which one is you\?/);
        assert.match(html, /The characters you play/);
        assert.match(html, /They can tick more than one/);
        assert.match(html, /Continue stays off until one is ticked/);
        assert.match(html, /Not yet to play none/);
        assert.match(html, /Which one lists a tick box for each character in the party/);
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
