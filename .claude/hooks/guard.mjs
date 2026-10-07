#!/usr/bin/env node
// PreToolUse guard for the KE team process (docs/TEAM_PROCESS.md §12.3).
// Usage (from .claude/settings.json): node guard.mjs shell | write
// Exit 2 blocks the tool call; stderr is shown to Claude as the reason.
// Internal errors fail open: GitHub branch protection is the server-side backstop.

import { readFileSync } from 'node:fs';

const mode = process.argv[2];

// Where each subagent type may write (repo-relative, forward slashes).
// Types not listed here (developers, built-in agents) may write anywhere
// except ALWAYS_DENIED. `.claude/tmp/` is always allowed.
const WRITE_ALLOW = {
  'tester': [isTestPath],
  'ux-designer': [(p) => p.startsWith('docs/design/')],
  'process-auditor': [(p) => p.startsWith('docs/audit/')],
  'security-reviewer': [],
  'task-runner': [],
};

// Process files: only the main session changes them, in a type:process PR.
const ALWAYS_DENIED = [
  (p) => p.startsWith('.claude/') && !p.startsWith('.claude/tmp/'),
  (p) => p === 'docs/TEAM_PROCESS.md',
  (p) => p === 'CLAUDE.md',
  (p) => /^\.github\/workflows\/claude[^/]*\.ya?ml$/.test(p),
];

export function isTestPath(p) {
  const segments = p.split('/');
  const dirs = segments.slice(0, -1);
  const file = segments[segments.length - 1];
  if (dirs.some((d) => ['tests', 'test', 'e2e', '__tests__'].includes(d))) return true;
  return /\.(test|spec)\.[^.]+$/.test(file) || /_test\.[^.]+$/.test(file) || /^test_.+\.py$/.test(file);
}

// Returns the repo-relative path, or null when the file is outside the repo.
export function toRepoPath(filePath, projectDir) {
  const norm = (s) => s.replace(/\\/g, '/').replace(/\/+$/, '');
  const abs = norm(filePath);
  const wt = abs.match(/\/\.claude\/worktrees\/[^/]+\/(.*)$/);
  if (wt) return wt[1];
  const root = norm(projectDir || '');
  if (!root) return null;
  // Windows paths are case-insensitive.
  if (abs.toLowerCase() === root.toLowerCase()) return '';
  if (abs.toLowerCase().startsWith(root.toLowerCase() + '/')) return abs.slice(root.length + 1);
  return null;
}

// Returns a reason string when the command must be blocked, otherwise null.
export function checkShell(command, isSubagent) {
  // Split on shell separators so each git/gh invocation is checked separately.
  const parts = command.split(/&&|\|\||;|\||\n/);
  for (const raw of parts) {
    const part = ' ' + raw.trim() + ' ';
    if (/\sgit\s/.test(part) && /\s--no-verify\s/.test(part)) {
      return 'Blocked: --no-verify is forbidden (CLAUDE.md, branches).';
    }
    if (/\sgit\s(?:.*\s)?push\s/.test(part)) {
      if (/\s(--force|--force-with-lease(=\S*)?|-f)\s/.test(part) || /\s\+\S+/.test(part)) {
        return 'Blocked: force-push is forbidden. Merge origin/main instead of rebasing (CLAUDE.md).';
      }
      if (/(\s|:)(refs\/heads\/)?(main|master)\s/.test(part)) {
        return 'Blocked: pushing to main is forbidden. Push to task/<N>-<slug> and open a PR.';
      }
    }
    if (isSubagent && /\sgh\s+pr\s+merge\s/.test(part)) {
      return 'Blocked: only the Lead (main session) merges PRs.';
    }
  }
  return null;
}

// Returns a reason string when the write must be blocked, otherwise null.
export function checkWrite(filePath, agentType, isSubagent, projectDir) {
  if (!isSubagent) return null;
  const rel = toRepoPath(filePath, projectDir);
  if (rel === null) return `Blocked: ${agentType} may not write outside the repository (${filePath}).`;
  if (rel.startsWith('.claude/tmp/')) return null;
  if (ALWAYS_DENIED.some((rule) => rule(rel))) {
    return `Blocked: ${rel} is a process file. Only the main session changes it, in a type:process PR.`;
  }
  const allow = WRITE_ALLOW[agentType];
  if (allow && !allow.some((rule) => rule(rel))) {
    return `Blocked: role ${agentType} may not write ${rel} (TEAM_PROCESS §12.3). Report the problem instead.`;
  }
  return null;
}

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, 'utf8'));
  } catch (e) {
    process.stderr.write(`guard.mjs: cannot parse hook input (${e.message}); allowing.\n`);
    process.exit(0);
  }
  const isSubagent = Boolean(input.agent_id);
  const agentType = input.agent_type || 'main';
  const ti = input.tool_input || {};
  let reason = null;
  if (mode === 'shell') {
    reason = checkShell(String(ti.command || ''), isSubagent);
  } else if (mode === 'write') {
    const target = ti.file_path || ti.notebook_path;
    if (target) reason = checkWrite(String(target), agentType, isSubagent, process.env.CLAUDE_PROJECT_DIR || input.cwd);
  }
  if (reason) {
    process.stderr.write(reason + '\n');
    process.exit(2);
  }
  process.exit(0);
}

if (process.argv[1] && /(^|[\\/])guard\.mjs$/.test(process.argv[1])) main();
