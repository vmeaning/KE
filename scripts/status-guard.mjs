#!/usr/bin/env node
// Status guard for KE task Issues (docs/TEAM_PROCESS.md §4.5).
// Rebuilds the label history from the Issue timeline, checks status:* and rework-*
// changes against the allowed transitions, reports each violation once and,
// when configured, mirrors the current status to a GitHub Projects board.
//
// Usage:
//   node scripts/status-guard.mjs --repo owner/name --issue N [--apply]
//   node scripts/status-guard.mjs --repo owner/name            (report on all Issues)
// Env: GITHUB_TOKEN or GH_TOKEN. Board sync (with --apply): PROJECT_TOKEN, KE_PROJECT_NUMBER.
// Without --apply nothing is written to GitHub.

// Allowed status transitions. 'none' = the Issue has no status:* label.
export const ALLOWED = {
  none: ['ready', 'blocked'],
  ready: ['in-progress', 'blocked'],
  'in-progress': ['testing', 'blocked'],
  testing: ['review', 'rework', 'blocked'],
  rework: ['in-progress', 'testing', 'blocked'],
  review: ['rework', 'done', 'blocked'],
  blocked: ['ready', 'in-progress', 'testing', 'rework', 'review'],
  done: [],
};

// These types have no tester (TEAM_PROCESS §4): in-progress → review is allowed for them.
export const NO_TESTER_TYPES = ['type:design', 'type:docs', 'type:process', 'type:spike'];

// Label edits by one actor within this window count as one transition
// (gh issue edit --add-label X --remove-label Y produces two events).
export const GROUP_WINDOW_MS = 10_000;

const STATUS_PREFIX = 'status:';
const REWORK_RE = /^rework-(\d+)$/;

const statusesOf = (labels) =>
  [...labels].filter((l) => l.startsWith(STATUS_PREFIX)).map((l) => l.slice(STATUS_PREFIX.length));
const reworksOf = (labels) =>
  [...labels].map((l) => REWORK_RE.exec(l)).filter(Boolean).map((m) => Number(m[1]));

// Keeps labeled/unlabeled events and groups them into transitions.
export function groupLabelEvents(timeline) {
  const events = timeline
    .filter((e) => (e.event === 'labeled' || e.event === 'unlabeled') && e.label && e.label.name)
    .map((e) => ({
      id: e.id,
      kind: e.event,
      label: e.label.name,
      actor: (e.actor && e.actor.login) || 'unknown',
      at: e.created_at,
      time: Date.parse(e.created_at),
    }))
    .sort((a, b) => a.time - b.time);
  const groups = [];
  for (const ev of events) {
    const last = groups[groups.length - 1];
    if (last && last.actor === ev.actor && ev.time - last.time <= GROUP_WINDOW_MS) {
      last.events.push(ev);
    } else {
      groups.push({ id: ev.id, actor: ev.actor, at: ev.at, time: ev.time, events: [ev] });
    }
  }
  return groups;
}

// Returns the violations found in the Issue timeline, in time order.
export function analyze(timeline) {
  const violations = [];
  const labels = new Set();
  let maxRework = 0;
  const report = (group, rule, message) =>
    violations.push({ id: `${rule}@${group.id}`, rule, at: group.at, actor: group.actor, message });

  for (const group of groupLabelEvents(timeline)) {
    const before = new Set(labels);
    for (const ev of group.events) {
      if (ev.kind === 'labeled') labels.add(ev.label);
      else labels.delete(ev.label);
    }

    const from = statusesOf(before);
    const to = statusesOf(labels);
    if (to.length > 1) {
      report(group, 'status-stacked', `Several status labels at once: ${to.map((s) => STATUS_PREFIX + s).join(', ')}. Replace the status, never stack it.`);
    } else if (from.length <= 1) {
      const a = from[0] || 'none';
      const b = to[0] || 'none';
      if (a !== b && !isAllowed(a, b, labels)) {
        report(group, 'transition', `Status transition ${a} → ${b} is not allowed by TEAM_PROCESS §4.5.`);
      }
    }

    const added = group.events
      .filter((ev) => ev.kind === 'labeled' && REWORK_RE.test(ev.label) && !before.has(ev.label))
      .map((ev) => Number(REWORK_RE.exec(ev.label)[1]));
    const now = reworksOf(labels);
    if (now.length > 1) {
      report(group, 'rework-stacked', `Several rework labels at once: ${now.map((k) => `rework-${k}`).join(', ')}.`);
    }
    for (const k of added) {
      if (k !== maxRework + 1) {
        report(group, 'rework-skipped', `rework-${k} added after rework-${maxRework}; the counter goes up by one.`);
      }
      if (!labels.has('status:rework')) {
        report(group, 'rework-without-status', `rework-${k} added without status:rework.`);
      }
      maxRework = Math.max(maxRework, k);
    }
    const removed = reworksOf(before).filter((k) => !labels.has(`rework-${k}`));
    if (removed.length > 0 && Math.max(0, ...now) < Math.max(...removed)) {
      report(group, 'rework-removed', `rework-${Math.max(...removed)} removed without a higher round; the counter is never reset.`);
    }
  }
  return violations;
}

export function isAllowed(from, to, labels) {
  if ((ALLOWED[from] || []).includes(to)) return true;
  return from === 'in-progress' && to === 'review' && NO_TESTER_TYPES.some((t) => labels.has(t));
}

// Current status from the timeline, or null when there is not exactly one.
export function currentStatus(timeline) {
  const labels = new Set();
  for (const group of groupLabelEvents(timeline)) {
    for (const ev of group.events) {
      if (ev.kind === 'labeled') labels.add(ev.label);
      else labels.delete(ev.label);
    }
  }
  const s = statusesOf(labels);
  return s.length === 1 ? s[0] : null;
}

export const marker = (id) => `<!-- status-guard:${id} -->`;

export function commentBody(violations) {
  const lines = violations.map((v) => `- **${v.rule}** — ${v.message} (by @${v.actor}, ${v.at}) ${marker(v.id)}`);
  return [
    '## Status guard — process violation',
    '',
    ...lines,
    '',
    'Status model: `docs/TEAM_PROCESS.md` §4.5. The process auditor reviews every `process-violation`.',
  ].join('\n');
}

// Matches a status label to a board option: "in-progress" ↔ "In progress".
export function pickOption(options, status) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return options.find((o) => norm(o.name) === norm(status)) || null;
}

// ---- GitHub I/O ----

const API = 'https://api.github.com';

async function rest(token, method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function restAll(token, path) {
  const out = [];
  for (let page = 1; ; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const items = await rest(token, 'GET', `${path}${sep}per_page=100&page=${page}`);
    out.push(...items);
    if (items.length < 100) return out;
  }
}

async function graphql(token, query, variables) {
  const res = await fetch(`${API}/graphql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`GraphQL: HTTP ${res.status} ${JSON.stringify(json.errors || json)}`);
  return json.data;
}

async function syncBoard(token, projectNumber, owner, issueNodeId, status) {
  const data = await graphql(
    token,
    `query($login: String!, $number: Int!) {
      repositoryOwner(login: $login) {
        ... on ProjectV2Owner {
          projectV2(number: $number) {
            id
            field(name: "Status") { ... on ProjectV2SingleSelectField { id options { id name } } }
          }
        }
      }
    }`,
    { login: owner, number: projectNumber },
  );
  const project = data.repositoryOwner && data.repositoryOwner.projectV2;
  if (!project || !project.field) throw new Error(`Project ${projectNumber} or its Status field not found`);
  const option = pickOption(project.field.options, status);
  if (!option) throw new Error(`Board has no Status option for "${status}"`);
  const added = await graphql(
    token,
    `mutation($p: ID!, $c: ID!) { addProjectV2ItemById(input: {projectId: $p, contentId: $c}) { item { id } } }`,
    { p: project.id, c: issueNodeId },
  );
  await graphql(
    token,
    `mutation($p: ID!, $i: ID!, $f: ID!, $o: String!) {
      updateProjectV2ItemFieldValue(input: {projectId: $p, itemId: $i, fieldId: $f, value: {singleSelectOptionId: $o}}) {
        projectV2Item { id }
      }
    }`,
    { p: project.id, i: added.addProjectV2ItemById.item.id, f: project.field.id, o: option.id },
  );
  return option.name;
}

async function checkIssue(token, repo, number, apply) {
  const timeline = await restAll(token, `/repos/${repo}/issues/${number}/timeline`);
  const violations = analyze(timeline);
  if (!apply) return violations;

  const comments = await restAll(token, `/repos/${repo}/issues/${number}/comments`);
  const reported = comments.map((c) => c.body || '').join('\n');
  const fresh = violations.filter((v) => !reported.includes(marker(v.id)));
  if (fresh.length > 0) {
    await rest(token, 'POST', `/repos/${repo}/issues/${number}/comments`, { body: commentBody(fresh) });
    await rest(token, 'POST', `/repos/${repo}/issues/${number}/labels`, { labels: ['process-violation'] });
  }
  console.log(`#${number}: ${violations.length} violation(s), ${fresh.length} new`);

  const projectToken = process.env.PROJECT_TOKEN;
  const projectNumber = Number(process.env.KE_PROJECT_NUMBER);
  const status = currentStatus(timeline);
  if (projectToken && projectNumber && status) {
    const issue = await rest(token, 'GET', `/repos/${repo}/issues/${number}`);
    const column = await syncBoard(projectToken, projectNumber, repo.split('/')[0], issue.node_id, status);
    console.log(`#${number}: board status → ${column}`);
  }
  return violations;
}

function parseArgs(argv) {
  const args = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--repo') args.repo = argv[++i];
    else if (argv[i] === '--issue') args.issue = argv[++i];
    else if (argv[i] === '--apply') args.apply = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token || !/^[\w.-]+\/[\w.-]+$/.test(args.repo || '')) {
    console.error('Usage: GITHUB_TOKEN=… node scripts/status-guard.mjs --repo owner/name [--issue N] [--apply]');
    process.exit(2);
  }
  if (args.issue) {
    if (!/^\d+$/.test(args.issue)) throw new Error(`Bad issue number: ${args.issue}`);
    await checkIssue(token, args.repo, args.issue, args.apply);
    return;
  }
  // Report mode for the process auditor: every Issue, nothing written to GitHub.
  const issues = (await restAll(token, `/repos/${args.repo}/issues?state=all`)).filter((i) => !i.pull_request);
  const lines = ['| Issue | Rule | When | Who | Details |', '|---|---|---|---|---|'];
  for (const issue of issues) {
    for (const v of await checkIssue(token, args.repo, issue.number, false)) {
      lines.push(`| #${issue.number} | ${v.rule} | ${v.at} | ${v.actor} | ${v.message} |`);
    }
  }
  console.log(`# Status guard report: ${args.repo}, ${issues.length} Issues, ${lines.length - 2} violation(s)\n`);
  console.log(lines.join('\n'));
}

if (process.argv[1] && /(^|[\\/])status-guard\.mjs$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
