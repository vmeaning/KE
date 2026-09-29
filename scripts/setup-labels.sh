#!/usr/bin/env bash
# Creates or updates the GitHub labels from docs/TEAM_PROCESS.md §10.
# Run once from the repository root (Git Bash on Windows): bash scripts/setup-labels.sh
set -euo pipefail

label() { gh label create "$1" --color "$2" --description "$3" --force >/dev/null && echo "ok  $1"; }

label "type:task"     "1d76db" "Development task"
label "type:bug"      "d73a4a" "Defect"
label "type:design"   "c5def5" "Design system or screen specs"
label "type:spike"    "bfd4f2" "Time-boxed investigation, no product code"
label "type:docs"     "0075ca" "Requirements, specs, ADR, docs"
label "type:process"  "5319e7" "Change to the team process or role instructions (PO approves)"
label "type:phase"    "000000" "Phase tracking issue"

label "area:backend"  "fbca04" "Server side"
label "area:frontend" "fef2c0" "Browser UI"
label "area:devops"   "f9d0c4" "CI/CD, packaging, install, operations"
label "area:design"   "d4c5f9" "Design"
label "area:docs"     "e4e669" "Documentation"

for n in 0 1 2 3 4 5 6 7 8 9; do label "phase:$n" "ededed" "Roadmap phase $n"; done

label "size:S" "c2e0c6" "Small: light cycle"
label "size:M" "7ee787" "Normal task: full cycle"
label "size:L" "2da44e" "Too big: the Lead must split it"

label "gate:security" "b60205" "Needs security-reviewer APPROVE before merge"
label "gate:contract" "b60205" "Needs Architect contract review before merge"
label "gate:design"   "b60205" "Needs ux-designer review before merge"

label "status:ready"       "0e8a16" "Definition of Ready met"
label "status:in-progress" "1d76db" "Developer at work (lock)"
label "status:testing"     "5319e7" "Tester verifying"
label "status:review"      "0052cc" "Waiting for Lead review and merge"
label "status:rework"      "e99695" "Returned to the developer"
label "status:blocked"     "d93f0b" "Stopped by a question"
label "status:done"        "cccccc" "Merged and closed"

label "rework-1"  "f9d0c4" "First rework round"
label "rework-2"  "f4a58a" "Second rework round"
label "rework-3"  "e4606d" "Third rework round: next FAIL escalates"
label "escalated" "b60205" "Escalated to the Lead after rework-3"
label "needs-po"  "fbca04" "Waiting for a product owner decision"
label "escaped"   "d73a4a" "Bug found after merge in verified code"
