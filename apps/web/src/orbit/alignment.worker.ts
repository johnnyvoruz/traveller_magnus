/**
 * The line-up search off the page's thread. One request in, one reply out
 * (orbit/alignment_runner.ts SearchRequest and SearchReply); the page stops the worker to
 * cancel. All the work is orbit/alignment.ts.
 */
import { searchAlignments } from './alignment.ts';
import type { SearchReply, SearchRequest } from './alignment_runner.ts';

addEventListener('message', (event: MessageEvent) => {
    const request = event.data as SearchRequest;
    void searchAlignments(request.found, request.options).then((result) => {
        const reply: SearchReply = { id: request.id, result };
        postMessage(reply);
    });
});
