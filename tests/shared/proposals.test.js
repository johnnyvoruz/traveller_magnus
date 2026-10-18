import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PROPOSAL_LIMITS, Proposal, ProposalBatchSubmit, ProposalDecision } from '@voyage/shared';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// The skill is a tracked file in repo-root skill/ (ZF1b, Johnny 2026-10-18 11:00): it is what referees are handed.
const SKILL_DIR = join(ROOT, 'skill');
const example = () => JSON.parse(readFileSync(join(SKILL_DIR, 'example_batch.json'), 'utf8'));
const messages = (result) => result.error.issues.map((issue) => issue.message).join(' | ');

const PERSON = {
    type: 'person', kind: '', name: 'A Person', summary: '', details: '', tags: [], anchor: null,
};
const create = (ref) => ({ ref, op: 'record.create', record: { ...PERSON, name: ref }, evidence: [{ at: '00:00:01', quote: 'Said aloud.' }] });

test('the example batch parses', () => {
    const result = ProposalBatchSubmit.safeParse(example());
    assert.equal(result.success, true, result.success ? '' : messages(result));
    assert.equal(result.data.proposals.length, 10);
});

test('a visibility key on a record is refused', () => {
    const batch = example();
    batch.proposals[0].record.visibility = 'players';
    const result = ProposalBatchSubmit.safeParse(batch);
    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((issue) => issue.code === 'unrecognized_keys' && issue.keys.includes('visibility')));
});

test('a visibility key on the proposal itself is refused', () => {
    const batch = example();
    batch.proposals[2].visibility = 'public';
    assert.equal(ProposalBatchSubmit.safeParse(batch).success, false);
});

test('a ref that names nothing is refused', () => {
    const batch = example();
    batch.proposals[2].link.to = { ref: 'nobody' };
    const result = ProposalBatchSubmit.safeParse(batch);
    assert.equal(result.success, false);
    assert.match(messages(result), /ref names no earlier record\.create/);
});

test('a link to a ref created later in the batch is refused', () => {
    const batch = example();
    const link = { ref: 'early', op: 'link.create', link: { from: { ref: 'teague' }, to: { ref: 'sato' }, kind: 'contact', role: '' }, evidence: [{ at: '00:00:01', quote: 'Said aloud.' }] };
    batch.proposals.splice(1, 0, link);
    const result = ProposalBatchSubmit.safeParse(batch);
    assert.equal(result.success, false);
    assert.match(messages(result), /ref names no earlier record\.create/);
});

test('201 proposals are refused, 200 pass', () => {
    const batch = example();
    batch.proposals = Array.from({ length: PROPOSAL_LIMITS.perBatch }, (_, i) => create('p' + i));
    assert.equal(PROPOSAL_LIMITS.perBatch, 200);
    assert.equal(ProposalBatchSubmit.safeParse(batch).success, true);
    batch.proposals.push(create('p200'));
    const result = ProposalBatchSubmit.safeParse(batch);
    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((issue) => issue.code === 'too_big' && issue.path.join('.') === 'proposals'));
});

test('a 301-character quote is refused, 300 passes, and a fourth quote is refused', () => {
    const batch = example();
    batch.proposals[0].evidence = [{ at: '00:00:40', quote: 'q'.repeat(300) }];
    assert.equal(ProposalBatchSubmit.safeParse(batch).success, true);
    batch.proposals[0].evidence = [{ at: '00:00:40', quote: 'q'.repeat(301) }];
    const result = ProposalBatchSubmit.safeParse(batch);
    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((issue) => issue.path.join('.') === 'proposals.0.evidence.0.quote'));
    batch.proposals[0].evidence = Array.from({ length: 4 }, () => ({ at: '00:00:40', quote: 'q' }));
    assert.equal(ProposalBatchSubmit.safeParse(batch).success, false);
});

test('a duplicate ref is refused', () => {
    const batch = example();
    batch.proposals[4].ref = 'teague';
    const result = ProposalBatchSubmit.safeParse(batch);
    assert.equal(result.success, false);
    assert.match(messages(result), /ref used twice/);
});

test('an update with nothing to change is refused; one with append passes', () => {
    const update = { op: 'record.update', id: 'cr_00000000-0000-4000-8000-000000000003', baseRev: 2, evidence: [{ at: '00:01:00', quote: 'Said aloud.' }] };
    const empty = Proposal.safeParse(update);
    assert.equal(empty.success, false);
    assert.match(messages(empty), /nothing to change/);
    assert.equal(Proposal.safeParse({ ...update, append: { details: 'Now a captain.' } }).success, true);
});

test('a record.create with an id, or a proposal without evidence, is refused', () => {
    const withId = create('x');
    withId.record.id = 'cr_00000000-0000-4000-8000-000000000009';
    assert.equal(Proposal.safeParse(withId).success, false);
    assert.equal(Proposal.safeParse({ ...create('y'), evidence: [] }).success, false);
});

test('a decision may carry the referee edit in the proposal shape', () => {
    const decision = { proposalId: 'pp_01HZY3K8Q4V6W7X8Y9Z0ABCDEF', action: 'accept', change: create('z') };
    assert.equal(ProposalDecision.safeParse(decision).success, true);
});

/** The skill's frontmatter, per report 4.5 (agentskills.io specification, portable keys). */
function frontmatter(text) {
    const match = /^---\n([\s\S]*?)\n---\n/.exec(text.replace(/\r\n/g, '\n'));
    assert.ok(match, 'SKILL.md opens with a frontmatter block');
    const fields = {};
    let parent = null;
    for (const line of match[1].split('\n')) {
        if (line.trim() === '') continue;
        const nested = /^ {2}([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
        if (nested && parent) {
            fields[parent][nested[1]] = nested[2].replace(/^"(.*)"$/, '$1');
            continue;
        }
        const top = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
        assert.ok(top, 'a frontmatter line is key: value: ' + line);
        if (top[2] === '') {
            parent = top[1];
            fields[parent] = {};
        } else {
            parent = null;
            fields[top[1]] = top[2];
        }
    }
    return { fields, body: text.slice(match[0].length) };
}

test('the SKILL.md frontmatter passes the format rules', () => {
    const text = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
    const { fields } = frontmatter(text);
    const allowed = ['name', 'description', 'license', 'compatibility', 'metadata'];
    for (const key of Object.keys(fields)) assert.ok(allowed.includes(key), 'key not allowed: ' + key);
    assert.match(fields.name, /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/);
    assert.ok(!/anthropic|claude/i.test(fields.name));
    assert.ok(fields.description.length > 0 && fields.description.length <= 1024, 'description length ' + fields.description.length);
    assert.ok(!/<[a-z/]/i.test(fields.description));
    assert.ok(fields.compatibility.length <= 500, 'compatibility length ' + fields.compatibility.length);
    assert.equal(typeof fields.metadata, 'object');
    for (const value of Object.values(fields.metadata)) assert.equal(typeof value, 'string');
    assert.ok(text.split('\n').length < 500, 'SKILL.md under 500 lines');
});

test('the skill uses the decided words and never says SI', () => {
    const text = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
    assert.match(text, /Proposals/);
    assert.match(text, /Agent access/);
    assert.match(text, /your AI agent/);
    assert.ok(!/\bSI\d*\b/.test(text));
});