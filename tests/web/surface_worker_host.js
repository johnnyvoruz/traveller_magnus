import { parentPort } from 'node:worker_threads';
import { attachSurfaceWorker } from '../../apps/web/src/surface/surface.worker.ts';

if (!parentPort) throw new Error('surface worker host needs a parent');
const port = parentPort;
attachSurfaceWorker({
    postMessage(data, transfer) {
        port.postMessage(data, transfer ?? []);
    },
    addEventListener(_type, listener) {
        port.on('message', (data) => listener({ data }));
    },
});
