# KE — context for Claude

KE is a service for managing configuration items (a CMDB) of an IT department. It runs **on-prem**, users work in a **browser**, and one codebase must run on **Windows and Linux** servers. Product owner (PO): Yura.

- Talk to the PO in **Russian**; technical terms may stay in English. Questions to the PO: a numbered list, each with options and your recommendation first, so he can answer "1a, 2c". Disagree openly when you see a better option.
- Current stage: **before architecture** — no stack chosen, no product code. The "Engineering rules" section below is filled in by the Architect in phase 0. While it is empty, nobody writes product code.

## Read before working
- `docs/TEAM_PROCESS.md` — roles, task cycle, gates, labels, escalation, and **decisions reserved for the PO (§2)**.
- The documents your task references. Read only what you need: token budget is shared with other projects.

## Roles
Skills (main session): `analyst`, `architect`, `lead`. Subagents: `task-runner`, `backend-developer`, `frontend-developer`, `devops-engineer`, `ux-designer`, `tester`, `security-reviewer`, `process-auditor`. When acting in a role, stay inside its boundaries: developers don't merge, reviewers don't edit code, nobody approves their own work.

## Where things live
Requirements `docs/requirements/` · architecture `docs/ARCHITECTURE.md` · ADR `docs/adr/` · API contract `docs/api/openapi.yaml` · phase specs `docs/phases/` · design `docs/design/` · admin runbook `docs/ops/` · audits `docs/audit/` · tasks, plans, reports: GitHub Issues and PRs.

## Working rules (all roles)
- **Evidence, not claims.** "Done" and "passes" mean you ran the command in this session and quote its result line. Never report something you did not verify; say "not verified" instead.
- **GitHub via `gh`.** Pass multi-line text with `--body-file` (write the file with the Write tool into `.claude/tmp/`), never inline heredocs — quoting differs between Git Bash and PowerShell.
- **Branches.** Never push to `main`, never force-push, never `--no-verify` (hooks block these). Task branches `task/<N>-<slug>`, document branches `docs/<slug>`. Only the Lead merges (squash).
- **Git in a worktree** (subagents with `isolation: worktree` start in their own worktree):
  ```
  git fetch origin
  git switch --detach origin/main                  # new task
  git switch --detach origin/task/<N>-<slug>       # existing task branch
  # ...edit, commit...
  git push origin HEAD:refs/heads/task/<N>-<slug>
  ```
  Detached HEAD is intentional: another worktree may hold the branch. To take in `main`, merge `origin/main` into your branch; never rebase a pushed branch.
- **Commits:** `<type>(#N): <summary>`, where type is one of feat, fix, test, docs, design, refactor, chore, ci. Commits, PRs, Issues and code comments are in English. Documents for the PO are in Russian.
- **Cross-platform.** Product code, scripts and tests must work on Windows and Linux. Build paths with path APIs, not string concatenation. Don't rely on file-name case, a specific shell or line endings (`.gitattributes` rules). Every OS-specific branch in code needs a test on both OSes in CI.
- **Secrets** never go into git, logs, tests or examples. Use placeholders.
- **Scope.** Do the task, not more. Put anything you notice outside the scope under "Noticed, not fixed" in your report.
- **Shell on this machine:** Windows 10, Git Bash. Commands in instructions are written for bash. `git`, `gh`, `node` and `npm` behave the same in PowerShell.

## Engineering rules
*To be filled by the Architect in phase 0: stack, repository layout, and exact commands for install, lint, format, typecheck, unit tests, integration tests, e2e, build and local run with demo data. Also where tests live and how a test references an acceptance criterion (`#N ACn`).*
