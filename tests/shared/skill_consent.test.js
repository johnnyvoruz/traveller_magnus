import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const page = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'skill', 'references', 'transcription.md'), 'utf8').replace(/\s+/g, ' ');

const shared = [
    'This is not legal advice.',
    'Ask every player before you record.',
    'Ask everyone when the players are in different places.',
    'California, Delaware, Florida, Illinois, Maryland, Massachusetts, Montana, Nevada, New Hampshire, Pennsylvania, and Washington.',
    'Michigan is contested.',
    'Oregon and Missouri require everyone\'s agreement for an in-person conversation.',
    'Connecticut and Nevada require it for a call.',
    'Germany requires it, under section 201 of its criminal code.',
    'New South Wales requires it.',
    'Canada and United States federal law let one person in the conversation agree.',
    'a private recording can fall under the household exemption.',
    'Uploading that recording to a cloud service may not.',
];

test('the skill consent page says what Help says', () => {
    for (const sentence of shared) assert.equal(page.includes(sentence), true, sentence);
    assert.equal(page.includes('Victoria'), false);
    assert.equal(page.includes('Queensland'), false);
    assert.equal(page.includes('passing the recording on'), false);
    assert.equal(page.includes('Elsewhere in the US'), false);
});
