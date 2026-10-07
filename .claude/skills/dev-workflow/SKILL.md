---
name: dev-workflow
description: Shared working procedure for KE developer subagents (backend-developer, frontend-developer, devops-engineer) - understanding the task, git in a worktree, tests, self-check, PR, rework rounds, return format. Preloaded into those agents; not for the main session.
user-invocable: false
---

# Developer workflow (shared by all developer agents)

An independent tester will verify your work **literally against the acceptance criteria**. Reviewers will read your diff without your reasoning. Aim for `PASS` on the first try: every rework round costs the PO time and tokens, and after three rounds the task is escalated.

## 1. Understand before you code
1. Read the Issue fully: goal, ACs, `Touches`, out of scope, notes. Read the phase-spec sections, contract operations and design specs it references. Read only those.
2. Study the neighbouring code: find the closest existing example of the same kind of change and follow its patterns.
3. Turn every AC into concrete test cases: happy path, boundaries, invalid input, missing permission, not found — whatever the AC and the business rules imply.
4. **Stop and ask** instead of guessing. Return `BLOCKED` when an AC is ambiguous, contradicts the contract or spec, cannot be met, or needs a decision outside the Issue. Give an exact question with options and your recommendation. A good question costs one message; a wrong guess costs a rework round.

## 2. Git
Follow "Git in a worktree" in `CLAUDE.md`. Initial round:
1. Start from `origin/main`.
2. Make the first commit.
3. Push to `task/<N>-<slug>`.
4. Open a **draft** PR: `gh pr create --draft --base main --head task/<N>-<slug> --title "<type>(#<N>): <summary>" --body-file .claude/tmp/pr-<N>.md`, with the body from `.github/pull_request_template.md`.

Later rounds continue on the same branch and PR.

## 3. Implement
- Change only what the Issue needs. Touching files outside `Touches` needs a reason in the PR.
- Match the style, naming and comment density of the neighbouring code. Comments explain *why*, not *what*.
- Handle errors explicitly. Never swallow an exception to make something pass.
- A new runtime dependency needs a reason: add the label `gate:security` to the Issue yourself and list the dependency (version, license, why) in the PR. Allowed licenses are in `CLAUDE.md`.
- Keep product behaviour identical on Windows and Linux (see `CLAUDE.md`).

## 4. Tests are part of the task
- Every `ACn` has at least one test that cites it (`#N ACn` in the test name or docstring), plus the negative and boundary cases its rules imply.
- Tests are deterministic: no real network, no sleeps, fixed clock and seeds, isolated data.
- **Bug fix:** first write the test that reproduces the bug, run it and see it fail, then fix.
- **Prove the key tests can fail:** for each AC, break the implementation for a moment (or run the test before implementing) and see red, then restore it. Record this in the PR under "Red-green evidence".
- **Forbidden:**
  - skipping or `xfail`-ing tests;
  - deleting or weakening existing assertions;
  - asserting on mocks of the unit under test;
  - snapshot-only tests for logic;
  - catching exceptions inside tests to make them pass;
  - tests that would pass if the feature were absent.

## 5. Self-check before handing over
1. Run **every** command from "Engineering rules" in `CLAUDE.md`: lint, format check, typecheck, full test suite and the build. Everything must be green. Quote the result lines in the PR.
2. Review your own diff (`git diff origin/main...HEAD`) as the tester and the Lead would. Remove debug output, commented-out code, TODOs without an Issue, and unrelated changes. Check error handling, input validation, authorization and secrets.
3. Update technical docs and the contract if behaviour changed within the Issue's scope. Requirement documents belong to the Analyst: report the gap instead of editing them.
4. Push, fill in the PR body completely, then `gh pr ready <M>`.

## 6. Rounds after the first
- **rework-K:** read the whole report (tester, gate or Lead). Address **every** item: fix it and add a regression test for each bug, or disagree with evidence. Don't skip items silently. Add a numbered "Rework response" to the PR mapping each report item to a commit or a reason. Never "fix" a report by weakening a test or changing an AC.
- **ci-fix:** reproduce the failure locally where possible and fix the root cause. Never disable, skip or loosen a check.
- **bot-fix:** handle each bot finding: fix it, or reply in its thread with the reason it doesn't apply.
- **sync:** merge `origin/main` into the branch, resolve conflicts keeping both intents, run the full self-check, and report whether the resolution changed logic.

## 7. Return (≤ 10 lines, nothing else)
```
DONE — PR #M · head <sha7> · round <round>
Checks: <command> — <result line>; …
ACs: all covered (see PR) | gaps: …
New dependencies: none | …
Noticed, not fixed: …
```
or
```
BLOCKED — <exact question>
Options: a) … (recommended) b) …
```

## Boundaries
- Never merge, never approve your own work.
- Never change ACs, specs, requirements, `.claude/**` or `docs/TEAM_PROCESS.md`.
- Never commit secrets or real customer data.
- Never claim a check passed unless you ran it in this session.
