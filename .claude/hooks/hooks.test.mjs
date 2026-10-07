// Tests for the process hooks. Run: node --test .claude/hooks/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { checkShell, checkWrite, toRepoPath, isTestPath } from './guard.mjs';
import { summarize } from './ledger.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const PROJECT = '/work/KE';
const WT = '/work/KE/.claude/worktrees/agent-1';

test('shell: allowed pushes and commands', () => {
  for (const cmd of [
    'git push origin HEAD:refs/heads/task/5-ci-matrix',
    'git push origin HEAD:refs/heads/task/12-main-page',
    'git push -u origin HEAD:refs/heads/docs/audit-phase-1',
    'echo main && git status',
    'gh pr create --draft --base main --head task/5-x --title t --body-file .claude/tmp/pr-5.md',
  ]) assert.equal(checkShell(cmd, true), null, cmd);
});

test('shell: blocked pushes', () => {
  for (const cmd of [
    'git push origin main',
    'git push origin HEAD:main',
    'git push origin HEAD:refs/heads/main',
    'git -C /x push origin master',
    'npm test && git push origin main',
    'git push --force origin HEAD:refs/heads/task/5-x',
    'git push -f origin HEAD:refs/heads/task/5-x',
    'git push --force-with-lease origin HEAD:refs/heads/task/5-x',
    'git push origin +HEAD:refs/heads/task/5-x',
    'git commit --no-verify -m "x"',
  ]) assert.notEqual(checkShell(cmd, false), null, cmd);
});

test('shell: merge only from the main session', () => {
  assert.notEqual(checkShell('gh pr merge 7 --squash --delete-branch', true), null);
  assert.equal(checkShell('gh pr merge 7 --squash --delete-branch', false), null);
});

test('paths: worktree, windows, case-insensitive root, outside', () => {
  assert.equal(toRepoPath(`${WT}/src/a.ts`, PROJECT), 'src/a.ts');
  assert.equal(toRepoPath('C:\\Work\\KE\\.claude\\worktrees\\a1\\tests\\x.test.ts', 'C:\\Work\\KE'), 'tests/x.test.ts');
  assert.equal(toRepoPath('c:\\work\\ke\\src\\a.ts', 'C:\\Work\\KE'), 'src/a.ts');
  assert.equal(toRepoPath('/tmp/x.txt', PROJECT), null);
});

test('test-path detection', () => {
  for (const p of ['tests/a.py', 'web/e2e/login.spec.ts', 'src/x/__tests__/y.tsx', 'src/a.test.ts', 'pkg/a_test.go', 'test_api.py'])
    assert.ok(isTestPath(p), p);
  for (const p of ['src/a.ts', 'src/testing.ts', 'docs/test-plan.md']) assert.ok(!isTestPath(p), p);
});

test('write: main session is unrestricted', () => {
  assert.equal(checkWrite(`${PROJECT}/.claude/agents/tester.md`, 'main', false, PROJECT), null);
});

test('write: process files are closed to every subagent', () => {
  for (const p of ['.claude/agents/tester.md', '.claude/settings.json', 'docs/TEAM_PROCESS.md', 'CLAUDE.md', '.github/workflows/claude-code-review.yml'])
    assert.notEqual(checkWrite(`${WT}/${p}`, 'backend-developer', true, PROJECT), null, p);
  assert.equal(checkWrite(`${WT}/.github/workflows/ci.yml`, 'devops-engineer', true, PROJECT), null);
  assert.equal(checkWrite(`${WT}/.claude/tmp/pr-5.md`, 'backend-developer', true, PROJECT), null);
});

test('write: role allowlists', () => {
  const cases = [
    ['tester', 'tests/acceptance/test_5.py', true],
    ['tester', 'web/e2e/5-login.spec.ts', true],
    ['tester', 'src/api/items.ts', false],
    ['tester', '.claude/tmp/report-5.md', true],
    ['ux-designer', 'docs/design/screens/S-01-ci-list/spec.md', true],
    ['ux-designer', 'src/app.tsx', false],
    ['process-auditor', 'docs/audit/phase-1-retro.md', true],
    ['process-auditor', 'docs/requirements/README.md', false],
    ['security-reviewer', '.claude/tmp/security-5.md', true],
    ['security-reviewer', 'src/auth.ts', false],
    ['task-runner', 'src/x.ts', false],
    ['backend-developer', 'src/api/items.ts', true],
    ['frontend-developer', 'web/src/App.tsx', true],
  ];
  for (const [agent, p, ok] of cases) {
    const reason = checkWrite(`${WT}/${p}`, agent, true, PROJECT);
    assert.equal(reason === null, ok, `${agent} → ${p}: ${reason}`);
  }
  assert.notEqual(checkWrite('/tmp/x.txt', 'backend-developer', true, PROJECT), null);
});

test('guard process: exit codes through stdin', () => {
  const run = (mode, input) =>
    spawnSync(process.execPath, [join(here, 'guard.mjs'), mode], {
      input: JSON.stringify(input),
      env: { ...process.env, CLAUDE_PROJECT_DIR: PROJECT },
    });
  const blocked = run('shell', { tool_input: { command: 'git push origin main' } });
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr.toString(), /main/);
  assert.equal(run('shell', { tool_input: { command: 'git status' } }).status, 0);
  const w = run('write', { agent_id: 'a', agent_type: 'tester', tool_input: { file_path: `${WT}/src/x.ts` } });
  assert.equal(w.status, 2);
  assert.equal(spawnSync(process.execPath, [join(here, 'guard.mjs'), 'shell'], { input: 'not json' }).status, 0);
});

test('ledger: usage summed once per message id', () => {
  const lines = [
    { type: 'user', message: { content: 'hi' } },
    { type: 'assistant', message: { id: 'm1', model: 'x', usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100 } } },
    { type: 'assistant', message: { id: 'm1', model: 'x', usage: { input_tokens: 10, output_tokens: 7, cache_read_input_tokens: 100 } } },
    { type: 'assistant', message: { id: 'm2', model: 'x', usage: { input_tokens: 3, output_tokens: 2 } } },
  ].map((l) => JSON.stringify(l)).join('\n') + '\nnot json\n';
  const s = summarize(lines);
  assert.equal(s.turns, 2);
  assert.equal(s.input_tokens, 13);
  assert.equal(s.output_tokens, 9);
  assert.equal(s.cache_read_input_tokens, 100);
  assert.equal(s.model, 'x');
});
