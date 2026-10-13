// Tests for scripts/status-guard.mjs. Run: node --test scripts/status-guard.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, currentStatus, commentBody, groupLabelEvents, marker, pickOption, ALLOWED } from './status-guard.mjs';

// Builds a timeline: each step is [secondsFromStart, 'labeled'|'unlabeled', label, actor?].
let nextId = 1;
function timeline(steps) {
  const t0 = Date.parse('2026-10-13T10:00:00Z');
  return steps.map(([s, event, name, actor = 'vmeaning']) => ({
    id: nextId++,
    event,
    label: { name },
    actor: { login: actor },
    created_at: new Date(t0 + s * 1000).toISOString(),
  }));
}
const rules = (tl) => analyze(tl).map((v) => v.rule);

// A full happy path with one rework round, as task-runner and the Lead set labels.
const happyPath = [
  [0, 'labeled', 'type:task'],
  [0, 'labeled', 'status:ready'],
  [100, 'labeled', 'status:in-progress'],
  [100, 'unlabeled', 'status:ready'],
  [200, 'labeled', 'status:testing'],
  [201, 'unlabeled', 'status:in-progress'],
  [300, 'labeled', 'status:rework'],
  [300, 'labeled', 'rework-1'],
  [300, 'unlabeled', 'status:testing'],
  [400, 'labeled', 'status:testing'],
  [400, 'unlabeled', 'status:rework'],
  [500, 'labeled', 'status:review'],
  [500, 'unlabeled', 'status:testing'],
  [600, 'labeled', 'status:rework'],
  [600, 'labeled', 'rework-2'],
  [600, 'unlabeled', 'rework-1'],
  [600, 'unlabeled', 'status:review'],
  [700, 'labeled', 'status:in-progress'],
  [700, 'unlabeled', 'status:rework'],
  [800, 'labeled', 'status:testing'],
  [800, 'unlabeled', 'status:in-progress'],
  [900, 'labeled', 'status:review'],
  [900, 'unlabeled', 'status:testing'],
  [1000, 'labeled', 'status:done'],
  [1000, 'unlabeled', 'status:review'],
];

test('#5 AC3: the full cycle with rework rounds has no violations', () => {
  assert.deepEqual(analyze(timeline(happyPath)), []);
  assert.equal(currentStatus(timeline(happyPath)), 'done');
});

test('#5 AC3: every pair in the transition table is accepted', () => {
  for (const [from, tos] of Object.entries(ALLOWED)) {
    for (const to of tos) {
      const steps = [];
      if (from !== 'none') steps.push([0, 'labeled', `status:${from}`]);
      steps.push([100, 'labeled', `status:${to}`]);
      if (from !== 'none') steps.push([100, 'unlabeled', `status:${from}`]);
      const extra = to === 'rework' ? [[100, 'labeled', 'rework-1']] : [];
      const tl = timeline([...steps, ...extra]);
      // Reaching a mid-cycle status straight from "none" in the setup is itself a violation; ignore it.
      const found = analyze(tl).filter((v) => v.at !== tl[0].created_at || from === 'none');
      assert.deepEqual(found, [], `${from} → ${to}`);
    }
  }
});

test('#5 AC4: a transition outside the table is reported', () => {
  const tl = timeline([
    [0, 'labeled', 'status:ready'],
    [100, 'labeled', 'status:review'],
    [100, 'unlabeled', 'status:ready'],
  ]);
  assert.deepEqual(rules(tl), ['transition']);
  assert.match(analyze(tl)[0].message, /ready → review/);
});

test('#5 AC4: in-progress → review is allowed only for types without a tester', () => {
  const steps = (type) => [
    [0, 'labeled', type],
    [0, 'labeled', 'status:ready'],
    [100, 'labeled', 'status:in-progress'],
    [100, 'unlabeled', 'status:ready'],
    [200, 'labeled', 'status:review'],
    [200, 'unlabeled', 'status:in-progress'],
  ];
  assert.deepEqual(rules(timeline(steps('type:docs'))), []);
  assert.deepEqual(rules(timeline(steps('type:design'))), []);
  assert.deepEqual(rules(timeline(steps('type:task'))), ['transition']);
});

test('#5 AC4: leaving done or dropping the status is reported', () => {
  assert.deepEqual(
    rules(timeline([[0, 'labeled', 'status:done'], [100, 'labeled', 'status:in-progress'], [100, 'unlabeled', 'status:done']])),
    ['transition', 'transition'], // none → done at creation, then done → in-progress
  );
  assert.deepEqual(rules(timeline([[0, 'labeled', 'status:ready'], [100, 'unlabeled', 'status:ready']])), ['transition']);
});

test('#5 AC4: two status labels at once are reported', () => {
  const tl = timeline([
    [0, 'labeled', 'status:ready'],
    [100, 'labeled', 'status:in-progress'], // old status never removed
  ]);
  assert.deepEqual(rules(tl), ['status-stacked']);
});

test('#5 AC4: paired edits split by more than the window are seen as a stacked state', () => {
  const tl = timeline([
    [0, 'labeled', 'status:ready'],
    [100, 'labeled', 'status:in-progress'],
    [130, 'unlabeled', 'status:ready'],
  ]);
  assert.deepEqual(rules(tl), ['status-stacked']);
});

test('#5 AC4: edits by different actors are not merged into one transition', () => {
  assert.equal(groupLabelEvents(timeline([[0, 'labeled', 'a', 'x'], [1, 'labeled', 'b', 'y']])).length, 2);
  assert.equal(groupLabelEvents(timeline([[0, 'labeled', 'a', 'x'], [1, 'labeled', 'b', 'x']])).length, 1);
});

test('#5 AC4: a skipped rework round is reported', () => {
  const tl = timeline([
    [0, 'labeled', 'status:testing'],
    [100, 'labeled', 'status:rework'],
    [100, 'labeled', 'rework-2'],
    [100, 'unlabeled', 'status:testing'],
  ]);
  assert.deepEqual(rules(tl), ['transition', 'rework-skipped']); // none → testing in the setup
});

test('#5 AC4: stacked rework labels are reported', () => {
  const tl = timeline([
    [0, 'labeled', 'status:ready'],
    [30, 'labeled', 'status:in-progress'],
    [30, 'unlabeled', 'status:ready'],
    [60, 'labeled', 'status:testing'],
    [60, 'unlabeled', 'status:in-progress'],
    [100, 'labeled', 'status:rework'],
    [100, 'labeled', 'rework-1'],
    [100, 'unlabeled', 'status:testing'],
    [200, 'labeled', 'status:testing'],
    [200, 'unlabeled', 'status:rework'],
    [300, 'labeled', 'status:rework'],
    [300, 'labeled', 'rework-2'], // rework-1 not removed
    [300, 'unlabeled', 'status:testing'],
  ]);
  assert.deepEqual(rules(tl), ['rework-stacked']);
});

test('#5 AC4: rework-N without status:rework is reported', () => {
  const tl = timeline([
    [0, 'labeled', 'status:ready'],
    [30, 'labeled', 'status:in-progress'],
    [30, 'unlabeled', 'status:ready'],
    [60, 'labeled', 'status:testing'],
    [60, 'unlabeled', 'status:in-progress'],
    [100, 'labeled', 'rework-1'],
  ]);
  assert.deepEqual(rules(tl), ['rework-without-status']);
});

test('#5 AC4: resetting the rework counter is reported', () => {
  const tl = timeline([
    [0, 'labeled', 'status:ready'],
    [30, 'labeled', 'status:in-progress'],
    [30, 'unlabeled', 'status:ready'],
    [60, 'labeled', 'status:testing'],
    [60, 'unlabeled', 'status:in-progress'],
    [100, 'labeled', 'status:rework'],
    [100, 'labeled', 'rework-1'],
    [100, 'unlabeled', 'status:testing'],
    [200, 'unlabeled', 'rework-1'],
  ]);
  assert.deepEqual(rules(tl), ['rework-removed']);
});

test('violation ids are stable, so a violation is commented only once', () => {
  nextId = 1000;
  const a = analyze(timeline([[0, 'labeled', 'status:ready'], [100, 'labeled', 'status:review'], [100, 'unlabeled', 'status:ready']]));
  nextId = 1000;
  const b = analyze(timeline([[0, 'labeled', 'status:ready'], [100, 'labeled', 'status:review'], [100, 'unlabeled', 'status:ready']]));
  assert.deepEqual(a.map((v) => v.id), b.map((v) => v.id));
  assert.ok(commentBody(a).includes(marker(a[0].id)));
});

test('board options match status labels regardless of case and separators', () => {
  const options = [{ id: '1', name: 'Ready' }, { id: '2', name: 'In progress' }, { id: '3', name: 'Done' }];
  assert.equal(pickOption(options, 'in-progress').id, '2');
  assert.equal(pickOption(options, 'done').id, '3');
  assert.equal(pickOption(options, 'testing'), null);
});
