#!/usr/bin/env node
// Token ledger for the process auditor (docs/TEAM_PROCESS.md §12.4).
// Usage (from .claude/settings.json): node ledger.mjs subagent | session
// Appends one JSON line per finished subagent / main session to .claude/logs/.
// Never blocks: always exits 0.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FIELDS = ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'];

// Sums usage over assistant messages; a message split into several lines counts once.
export function summarize(transcriptText) {
  const byId = new Map();
  let model = null;
  for (const line of transcriptText.split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const msg = entry && entry.message;
    if (!msg || entry.type !== 'assistant' || !msg.usage) continue;
    byId.set(msg.id || `line-${byId.size}`, msg.usage);
    if (msg.model) model = msg.model;
  }
  const totals = Object.fromEntries(FIELDS.map((f) => [f, 0]));
  for (const usage of byId.values()) {
    for (const f of FIELDS) totals[f] += Number(usage[f]) || 0;
  }
  return { model, turns: byId.size, ...totals };
}

function main() {
  const kind = process.argv[2];
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const transcript = kind === 'subagent' ? input.agent_transcript_path : input.transcript_path;
  const usage = transcript && existsSync(transcript) ? summarize(readFileSync(transcript, 'utf8')) : {};
  const record = {
    ts: new Date().toISOString(),
    session_id: input.session_id,
    ...(kind === 'subagent'
      ? {
          agent_type: input.agent_type,
          agent_id: input.agent_id,
          head: String(input.last_assistant_message || '').split('\n')[0].slice(0, 160),
        }
      : { reason: input.reason }),
    ...usage,
  };
  const dir = join(process.env.CLAUDE_PROJECT_DIR || input.cwd || '.', '.claude', 'logs');
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, kind === 'subagent' ? 'agent-runs.jsonl' : 'sessions.jsonl'), JSON.stringify(record) + '\n');
}

if (process.argv[1] && /(^|[\\/])ledger\.mjs$/.test(process.argv[1])) {
  try {
    main();
  } catch (e) {
    process.stderr.write(`ledger.mjs: ${e.message}\n`);
  }
  process.exit(0);
}
