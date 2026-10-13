import assert from 'node:assert/strict';
import test from 'node:test';
import { chargesMutationBudget, MUTATION_BUDGET } from '../../apps/api/src/universe/budget.ts';
import { busyDelayMs, BUSY_SENTENCE, nextSliceOffset } from '../../apps/api/src/jobs/generate_pace.ts';

test('a generate batch does not spend the universe mutation budget', () => {
    assert.equal(MUTATION_BUDGET, 120);
    assert.equal(chargesMutationBudget('GET', '/jobs/job-1/slice', null), false);
    assert.equal(chargesMutationBudget('POST', '/jobs/job-1/stop', null), true);
    assert.equal(chargesMutationBudget('POST', '/pin', null), true);
    assert.equal(chargesMutationBudget('POST', '/jobs/job-1/batch', null), true);
    assert.equal(chargesMutationBudget('POST', '/jobs/job-1/batch', 'generate'), false);
    assert.equal(chargesMutationBudget('POST', '/jobs/job-1/fail', 'generate'), false);
    assert.equal(chargesMutationBudget('POST', '/jobs/job-1/settled', 'generate'), false);
    assert.equal(chargesMutationBudget('POST', '/jobs/job-1/stop', 'generate'), true);
    assert.equal(chargesMutationBudget('POST', '/campaign/changes', 'generate'), false);
});

test('a refused post waits twice and then the job ends', () => {
    assert.equal(busyDelayMs('60', 0), 60_000);
    assert.equal(busyDelayMs('1', 1), 1_000);
    assert.equal(busyDelayMs('60', 2), null);
    assert.equal(BUSY_SENTENCE, 'This universe is busy. Generation stopped. Try again in a minute.');
});

test('the next slice is the hole in front of a later one', () => {
    assert.equal(nextSliceOffset([], 80, 32), 0);
    assert.equal(nextSliceOffset([0, 32], 80, 32), 64);
    assert.equal(nextSliceOffset([64], 80, 32), 0);
    assert.equal(nextSliceOffset([0, 32, 64], 80, 32), 80);
});
