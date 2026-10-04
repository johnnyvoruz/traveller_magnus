/**
 * Headless driver for the dev surface-parity page.
 * Prefers Edge, then Chrome. Exits non-zero when any world mismatches.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'apps', 'web');
const viteBin = [
    path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
    path.join(web, 'node_modules', 'vite', 'bin', 'vite.js'),
].find((file) => existsSync(file)) ?? '';
const pagePort = 5199;
const debugPort = 9333;
const pageUrl = `http://127.0.0.1:${pagePort}/dev/surface-parity`;
const glUrl = `http://127.0.0.1:${pagePort}/dev/surface-parity/gl`;
const glDebugPort = 9334;
const deadlineMs = 360000;

const browsers = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

function browserPath() {
    for (const file of browsers) if (existsSync(file)) return file;
    return '';
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(url, ms) {
    const deadline = Date.now() + ms;
    let last = '';
    while (Date.now() < deadline) {
        try {
            const response = await fetch(url);
            if (response.ok || response.status === 200) return;
            last = `${response.status}`;
        } catch (err) {
            last = err instanceof Error ? err.message : String(err);
        }
        await sleep(250);
    }
    throw new Error(`Timed out waiting for ${url} (${last})`);
}

function killPid(pid) {
    if (!pid) return;
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
}

function saveDifference(dir, world) {
    if (!world || !world.differenceImage) return;
    const match = /^data:image\/png;base64,(.+)$/.exec(world.differenceImage);
    if (!match) return;
    mkdirSync(dir, { recursive: true });
    const name = String(world.id).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'world';
    writeFileSync(path.join(dir, name + '.png'), Buffer.from(match[1], 'base64'));
    console.error('Difference image: ' + path.join(dir, name + '.png'));
}

function killBrowsersUsing(dir) {
    const safe = dir.replace(/'/g, "''");
    const command = [
        `$dir = '${safe}'`,
        'Get-CimInstance Win32_Process | Where-Object {',
        "  ($_.Name -eq 'chrome.exe' -or $_.Name -eq 'msedge.exe') -and $_.CommandLine -and $_.CommandLine.Contains($dir)",
        '} | ForEach-Object { & taskkill /pid $_.ProcessId /T /F | Out-Null }',
    ].join('\n');
    spawnSync('powershell', ['-NoProfile', '-Command', command], { stdio: 'ignore' });
}

async function readResult(wsUrl, resultKey) {
    if (resultKey !== '__surfaceParity' && resultKey !== '__surfaceGlParity') throw new Error('Unexpected result key.');
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve);
        ws.addEventListener('error', () => reject(new Error('DevTools socket failed.')));
    });
    let nextId = 0;
    const pending = new Map();
    ws.addEventListener('message', (event) => {
        const data = JSON.parse(String(event.data));
        const wait = pending.get(data.id);
        if (!wait) return;
        pending.delete(data.id);
        if (data.error) wait.reject(new Error(JSON.stringify(data.error)));
        else wait.resolve(data.result);
    });
    function send(method, params) {
        const id = ++nextId;
        return new Promise((resolve, reject) => {
            pending.set(id, { resolve, reject });
            ws.send(JSON.stringify({ id, method, params }));
        });
    }
    const expression = `window.${resultKey} ? JSON.stringify(window.${resultKey}) : ""`;
    const deadline = Date.now() + deadlineMs;
    let result = null;
    while (Date.now() < deadline) {
        const evaluated = await send('Runtime.evaluate', { expression, returnByValue: true });
        const text = evaluated?.result?.value;
        if (text) {
            const parsed = JSON.parse(text);
            if (parsed.status === 'done' || parsed.status === 'error') {
                result = parsed;
                break;
            }
        }
        await sleep(500);
    }
    ws.close();
    if (!result) throw new Error(resultKey + ' did not finish.');
    return result;
}

function fileSha(file) {
    return createHash('sha256').update(readFileSync(file)).digest('hex');
}

async function withBrowser(executable, profileDir, debugPort, url, extraArgs, resultKey) {
    const child = spawn(executable, [
        '--headless=new',
        ...extraArgs,
        '--no-first-run',
        '--disable-extensions',
        '--remote-allow-origins=*',
        `--user-data-dir=${profileDir}`,
        `--remote-debugging-port=${debugPort}`,
        'about:blank',
    ], { stdio: 'ignore' });
    try {
        await waitFor(`http://127.0.0.1:${debugPort}/json/version`, 30000);
        const version = await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json();
        const opened = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
        if (!opened.ok) throw new Error(`DevTools did not open the page (${opened.status}).`);
        const target = await opened.json();
        if (!target.webSocketDebuggerUrl) throw new Error('DevTools target has no socket.');
        const result = await readResult(target.webSocketDebuggerUrl, resultKey);
        return { result, browser: version.Browser || '', userAgent: version['User-Agent'] || '' };
    } finally {
        killPid(child.pid);
        killBrowsersUsing(profileDir);
    }
}

function withoutImage(world) {
    if (!world) return null;
    const copy = { ...world };
    delete copy.differenceImage;
    delete copy.legacyStats;
    delete copy.legacyProfile;
    return copy;
}

function writeGlFixture(result) {
    const worlds = [];
    for (const world of result.worlds ?? []) {
        const stats = world.legacyStats;
        if (stats == null) {
            worlds.push({
                id: world.id,
                statsSha256: null,
                statsBase64: null,
                thresholds: world.legacyThresholds ?? null,
                profile: world.legacyProfile ? JSON.parse(world.legacyProfile) : null,
            });
            continue;
        }
        const bytes = Buffer.from(stats);
        worlds.push({
            id: world.id,
            statsSha256: createHash('sha256').update(bytes).digest('hex'),
            statsBase64: bytes.toString('base64'),
            thresholds: world.legacyThresholds ?? null,
            profile: JSON.parse(world.legacyProfile),
        });
    }
    const file = path.join(root, 'tests', 'web', 'fixtures', 'surface_gl.json');
    writeFileSync(file, JSON.stringify({ worlds }) + '\n');
    console.error('Wrote ' + file + ' (' + worlds.length + ' worlds)');
}

function glExitProblems(summary) {
    const problems = [];
    if (summary.status !== 'done') problems.push(summary.message || 'GL status');
    const renderer = String(summary.gpu?.unmaskedRenderer || summary.gpu?.renderer || '');
    if (!renderer.trim()) problems.push('empty GPU renderer');
    if (summary.frozenTime !== 12.5) problems.push('frozen time');
    const required = ['Ocean', 'Dry', 'Ice', 'Gas', 'Ringed'];
    const ids = new Set((summary.worlds || []).map((world) => world.id));
    for (const id of required) if (!ids.has(id)) problems.push('missing ' + id);
    for (const world of summary.worlds || []) {
        if (world.problems?.length) problems.push(world.id + ': ' + world.problems.join(', '));
        if (world.profileEqual !== true) problems.push(world.id + ' profile');
        if (world.timeUsed !== 12.5) problems.push(world.id + ' time');
        if (world.id === 'Gas') {
            if (!world.stats || world.stats.absent !== true) problems.push('gas stats');
        } else if (!world.stats || world.stats.absent === true || world.stats.mismatches !== 0 || world.stats.length !== 32768) {
            problems.push(world.id + ' stats');
        }
        if (!world.cube32 || world.cube32.mismatches !== 0) problems.push(world.id + ' cube32');
        if (!world.cube128 || world.cube128.mismatches !== 0) problems.push(world.id + ' cube128');
        if (!world.mip128 || world.mip128.mismatches !== 0) problems.push(world.id + ' mip1');
        if (world.id === 'Ocean' && (!world.cube512 || world.cube512.mismatches !== 0)) problems.push('Ocean cube512');
        if (!world.tile || world.tile.compared !== true || world.tile.mismatches !== 0 || world.tile.varied !== true || world.tile.alpha !== true) {
            problems.push(world.id + ' tile');
        }
    }
    const shadeIds = [
        'Ocean tilt 0', 'Ocean tilt 90', 'Ocean tilt 120', 'Ocean sweep 0', 'Ocean sweep 0.5',
        'Ocean eclipse', 'Ocean light', 'Ocean radius 2.5', 'Ocean radius 1100',
        'Ringed phase 0.75', 'Ringed phase 0',
    ];
    const shades = summary.shades || [];
    const seenShade = new Set(shades.map((shade) => shade.id));
    for (const id of shadeIds) if (!seenShade.has(id)) problems.push('missing shade ' + id);
    for (const shade of shades) {
        if (shade.problems?.length) problems.push(shade.id + ': ' + shade.problems.join(', '));
        if (shade.mismatches !== 0 || shade.varied !== true || shade.alpha !== true) problems.push(shade.id + ' tile');
    }
    if (!summary.regina || summary.regina.error || !(summary.regina.bodies > 0) || typeof summary.regina.wallMs !== 'number') {
        problems.push('regina batch');
    }
    const negative = summary.negativeControl;
    if (!negative || !(negative.againstOceanCube32Mismatches > 0)) problems.push('negative control matched');
    if (negative?.problems?.length) problems.push('negative: ' + negative.problems.join(', '));
    if (negative && negative.cube32?.mismatches !== 0) problems.push('negative realms disagree');
    return problems;
}

const executable = browserPath();
if (!executable) {
    console.error('No Edge or Chrome executable was found. Install one, or say if a browser-automation package should be added. Nothing was installed.');
    process.exit(2);
}
if (!existsSync(viteBin)) {
    console.error('Vite is not installed in apps/web. Nothing was installed.');
    process.exit(2);
}

async function writeReginaShade() {
    const { createRequire } = await import('node:module');
    const { buildSector } = await import('@voyage/generation');
    const { TRUTH_SEED, TRUTH_SETTINGS } = await import('../tools/truth/settings.js');
    const { normalizeSystem } = await import('../apps/web/src/orbit/system.ts');
    const require = createRequire(import.meta.url);
    const engineVersion = require(path.join(root, 'packages/engines/package.json')).version;
    const listed = JSON.parse(readFileSync(path.join(root, 'universe/raw/sectors.json'), 'utf8'))
        .sectors.find((sector) => sector.slug === 'Spinward_Marches');
    const marches = await buildSector({
        slug: 'Spinward_Marches',
        tsv: readFileSync(path.join(root, 'universe/raw/Spinward_Marches.tsv'), 'utf8'),
        metadataXml: readFileSync(path.join(root, 'universe/raw/Spinward_Marches.xml'), 'utf8'),
        pinned: { seed: TRUTH_SEED, settings: TRUTH_SETTINGS, engineVersion },
        version: 'v2',
        catalogue: { name: listed.name, x: listed.x, y: listed.y, tags: listed.tags, canonical: listed.canonical },
    });
    const regina = marches.index.hexes['1910'];
    const tree = JSON.parse(marches.objects.get(regina.tree));
    const system = normalizeSystem(tree.body);
    if (!system) throw new Error('Regina did not normalise');
    mkdirSync(path.join(root, '.tmp'), { recursive: true });
    writeFileSync(path.join(root, '.tmp', 'regina-shade.json'), JSON.stringify({ hexId: '1910', system }));
}

let vite;
let exitCode = 0;
try {
    await writeReginaShade();
    vite = spawn(process.execPath, [viteBin, '--port', String(pagePort), '--strictPort', '--host', '127.0.0.1'], {
        cwd: web,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let viteLog = '';
    vite.stdout.on('data', (chunk) => { viteLog += chunk; });
    vite.stderr.on('data', (chunk) => { viteLog += chunk; });
    vite.on('exit', (code) => {
        if (code && !viteLog.includes('Local:')) viteLog += `\nvite exited ${code}`;
    });
    await waitFor(`http://127.0.0.1:${pagePort}/dev/surface-parity/realm.html`, 60000);
    const realm = await fetch(`http://127.0.0.1:${pagePort}/dev/surface-parity/legacy/planet_renderer.js`);
    const realmText = await realm.text();
    if (!realm.ok || !realmText.includes('renderFlatMap')) {
        throw new Error('Dev middleware did not serve js/planet_renderer.js from disk.');
    }
    try {
        const mapProfile = mkdtempSync(path.join(tmpdir(), 'voyage-surface-parity-'));
        const opened = await withBrowser(executable, mapProfile, debugPort, pageUrl, ['--disable-gpu'], '__surfaceParity');
        const result = opened.result;
        const required = [
            'Regina', 'Jewell', 'Efate', 'Dry', 'Ice', 'Molten', 'Hydro 0', 'Hydro A', 'Exotic A',
            'Regina print', 'Regina sliders 0.2/0.9', 'Regina sliders 0.85/0.15',
        ];
        const worlds = (result.worlds ?? []).map((world) => ({
            id: world.id,
            mismatches: world.mismatches,
            maxChannelError: world.maxChannelError,
            meanChannelError: world.meanChannelError,
            width: world.width,
            height: world.height,
            legacyDistinctColours: world.legacyDistinctColours,
            legacyAlpha: world.legacyAlpha,
        }));
        const negative = result.negativeControl;
        const summary = {
            ok: result.ok === true && result.status === 'done',
            status: result.status,
            message: result.message ?? '',
            reginaPixelsMs: result.reginaPixelsMs,
            worlds,
            negativeControl: negative ? {
                id: negative.id,
                mismatches: negative.mismatches,
                maxChannelError: negative.maxChannelError,
                meanChannelError: negative.meanChannelError,
                width: negative.width,
                height: negative.height,
            } : null,
        };
        const diffDir = path.join(root, '.tmp', 'surface-parity');
        for (const world of result.worlds ?? []) if (world.mismatches > 0) saveDifference(diffDir, world);
        if (negative && !(negative.mismatches > 0)) saveDifference(diffDir, negative);
        console.log(JSON.stringify(summary, null, 2));
        const ids = new Set(worlds.map((world) => world.id));
        const missing = required.filter((id) => !ids.has(id));
        const badFrame = worlds.some((world) => world.mismatches !== 0
            || world.width !== 800
            || world.height !== 400
            || world.legacyDistinctColours < 2
            || world.legacyAlpha !== true);
        if (!summary.ok || missing.length > 0 || badFrame || !(negative && negative.mismatches > 0) || typeof result.reginaPixelsMs !== 'number') {
            if (missing.length > 0) console.error('Missing worlds: ' + missing.join(', '));
            exitCode = 1;
        }
    } catch (err) {
        console.error(err instanceof Error ? err.message : err);
        exitCode = 1;
    }
    try {
        const glHash = fileSha(path.join(root, 'js', 'planet_gl.js'));
        const profileHash = fileSha(path.join(root, 'js', 'planet_profile.js'));
        const manifestResponse = await fetch(`http://127.0.0.1:${pagePort}/dev/surface-parity/gl/manifest.json`);
        if (!manifestResponse.ok) throw new Error('GL manifest was not served.');
        const manifest = await manifestResponse.json();
        if (manifest.planetGlSha256 !== glHash || manifest.planetProfileSha256 !== profileHash) {
            throw new Error('GL manifest does not match js/planet_gl.js and js/planet_profile.js on disk.');
        }
        const servedProfile = Buffer.from(await (await fetch(`http://127.0.0.1:${pagePort}/dev/surface-parity/gl/planet_profile.js`)).arrayBuffer());
        if (createHash('sha256').update(servedProfile).digest('hex') !== profileHash) {
            throw new Error('Served planet_profile.js does not match the file on disk.');
        }
        const servedGl = await (await fetch(`http://127.0.0.1:${pagePort}/dev/surface-parity/gl/planet_gl.js`)).text();
        for (const marker of ['voyage-gl-insert:stats-readback', 'voyage-gl-insert:frozen-time', 'voyage-gl-insert:capture-export']) {
            if (!servedGl.includes(marker)) throw new Error('Served planet_gl.js is missing ' + marker);
        }
        const servedRealm = await (await fetch(`http://127.0.0.1:${pagePort}/dev/surface-parity/gl/realm.html`)).text();
        if (servedRealm.includes('.inspect(')) throw new Error('GL realm calls inspect.');
        const glProfile = mkdtempSync(path.join(tmpdir(), 'voyage-surface-gl-'));
        let glRun = await withBrowser(executable, glProfile, glDebugPort, glUrl, [], '__surfaceGlParity');
        glRun.launch = 'default';
        if (glRun.result?.status === 'error' && /WebGL2 is not available/i.test(String(glRun.result.message || ''))) {
            console.error('WebGL2 was unavailable. Retrying with the GPU blocklist ignored.');
            const retryProfile = mkdtempSync(path.join(tmpdir(), 'voyage-surface-gl-'));
            glRun = await withBrowser(executable, retryProfile, glDebugPort, glUrl, ['--ignore-gpu-blocklist', '--enable-webgl'], '__surfaceGlParity');
            glRun.launch = 'ignore-gpu-blocklist';
        }
        const result = glRun.result;
        if (process.env.UPDATE_SURFACE_GL === '1' && result?.worlds?.length) writeGlFixture(result);
        const summary = {
            ok: result.ok === true && result.status === 'done',
            status: result.status,
            message: result.message ?? '',
            frozenTime: result.frozenTime,
            shadeCompared: result.shadeCompared === true,
            frozen: result.frozen ?? null,
            readback: result.readback ?? null,
            cold: result.cold ?? null,
            source: result.source ?? manifest,
            disk: { planetGlSha256: glHash, planetProfileSha256: profileHash, match: true },
            gpu: {
                ...(result.gpu ?? {}),
                browser: glRun.browser,
                devtoolsUserAgent: glRun.userAgent,
                launch: glRun.launch,
            },
            worlds: (result.worlds ?? []).map(withoutImage),
            shades: (result.shades ?? []).map(withoutImage),
            regina: result.regina ?? null,
            negativeControl: withoutImage(result.negativeControl),
        };
        const glDiff = path.join(root, '.tmp', 'surface-parity-gl');
        for (const world of result.worlds ?? []) if (world.differenceImage) saveDifference(glDiff, world);
        for (const shade of result.shades ?? []) if (shade.differenceImage) saveDifference(glDiff, shade);
        if (result.negativeControl?.differenceImage) saveDifference(glDiff, result.negativeControl);
        console.log(JSON.stringify(summary, null, 2));
        const problems = glExitProblems(summary);
        if (problems.length > 0 || summary.ok !== true) {
            if (problems.length > 0) console.error(problems.join('\n'));
            exitCode = 1;
        }
    } catch (err) {
        console.error(err instanceof Error ? err.message : err);
        exitCode = 1;
    }
    process.exitCode = exitCode === 0 ? undefined : 1;
} catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
} finally {
    killPid(vite?.pid);
}
