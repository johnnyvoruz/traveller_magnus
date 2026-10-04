import fs from 'node:fs';
import type { ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { glRealmHtml, glSourceManifest, instrumentedPlanetGl, planetProfileBytes } from './surface-parity-gl.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const REALM_HTML = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body>
<canvas id="sheet" width="800" height="400"></canvas>
<script src="/dev/surface-parity/legacy/prng.js"></script>
<script src="/dev/surface-parity/legacy/planet_renderer.js"></script>
<script>
var masterSeed = 'TravellerMagnus';
window.renderSurface = function (inputs) {
    masterSeed = inputs.masterSeed;
    window.planetContinentalDefinition = inputs.continentalDefinition;
    window.planetCoastlineComplexity = inputs.coastlineComplexity;
    window.printMode = !!inputs.printMode;
    var canvas = document.getElementById('sheet');
    window.PlanetRenderer.renderFlatMap(canvas, inputs.worldData, inputs.hexId, {
        projection: inputs.projection,
        numLobes: inputs.numLobes
    });
    return canvas;
};
</script>
</body>
</html>
`;

function send(res: ServerResponse, type: string, body: string | Buffer): void {
    res.statusCode = 200;
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'no-store');
    res.end(body);
}

function prngSource(): string {
    const core = fs.readFileSync(path.join(repoRoot, 'js', 'core.js'), 'utf8');
    const start = core.indexOf('function hashString');
    const end = core.indexOf('function setRandomSeed');
    if (start < 0 || end < start) throw new Error('legacy hashString/mulberry32 markers are missing from js/core.js');
    return core.slice(start, end);
}

/** Dev server only. Legacy files are read from disk and are not part of the client graph. */
export function surfaceParityDev(): Plugin {
    return {
        name: 'surface-parity-dev',
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                const url = req.url?.split('?')[0];
                try {
                    if (url === '/dev/surface-parity/legacy/planet_renderer.js') {
                        send(res, 'text/javascript; charset=utf-8', fs.readFileSync(path.join(repoRoot, 'js', 'planet_renderer.js'), 'utf8'));
                        return;
                    }
                    if (url === '/dev/surface-parity/legacy/prng.js') {
                        send(res, 'text/javascript; charset=utf-8', prngSource());
                        return;
                    }
                    if (url === '/dev/surface-parity/realm.html') {
                        send(res, 'text/html; charset=utf-8', REALM_HTML);
                        return;
                    }
                    if (url === '/dev/surface-parity/gl/planet_profile.js') {
                        send(res, 'text/javascript; charset=utf-8', planetProfileBytes());
                        return;
                    }
                    if (url === '/dev/surface-parity/gl/planet_gl.js') {
                        send(res, 'text/javascript; charset=utf-8', instrumentedPlanetGl());
                        return;
                    }
                    if (url === '/dev/surface-parity/gl/realm.html') {
                        send(res, 'text/html; charset=utf-8', glRealmHtml());
                        return;
                    }
                    if (url === '/dev/surface-parity/gl/manifest.json') {
                        send(res, 'application/json; charset=utf-8', JSON.stringify(glSourceManifest()));
                        return;
                    }
                } catch (err) {
                    res.statusCode = 500;
                    res.end(err instanceof Error ? err.message : String(err));
                    return;
                }
                next();
            });
        },
    };
}
