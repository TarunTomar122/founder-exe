#!/usr/bin/env python3
import json
import sqlite3
import sys

trace_id = sys.argv[1]
database = sys.argv[2] if len(sys.argv) > 2 else "/home/ubuntu/.hermes/state.db"
connection = sqlite3.connect(f"file:{database}?mode=ro", uri=True, timeout=10)
connection.row_factory = sqlite3.Row
rows = connection.execute(
    """
    SELECT DISTINCT s.id, s.model, s.billing_provider, s.input_tokens,
      s.output_tokens, s.cache_read_tokens, s.cache_write_tokens,
      s.reasoning_tokens, s.estimated_cost_usd, s.actual_cost_usd,
      s.api_call_count, s.tool_call_count, s.started_at, s.ended_at
    FROM sessions s
    JOIN messages m ON m.session_id = s.id
    WHERE m.role = 'user' AND instr(m.content, ?) > 0
    ORDER BY s.started_at ASC
    """,
    (f"TRACE_ID: {trace_id}",),
).fetchall()

def total(field):
    return sum((row[field] or 0) for row in rows)

payload = {
    "sessionIds": [row["id"] for row in rows],
    "model": rows[-1]["model"] if rows else None,
    "provider": rows[-1]["billing_provider"] if rows else None,
    "inputTokens": total("input_tokens"),
    "outputTokens": total("output_tokens"),
    "cacheReadTokens": total("cache_read_tokens"),
    "cacheWriteTokens": total("cache_write_tokens"),
    "reasoningTokens": total("reasoning_tokens"),
    "estimatedCostUsd": total("estimated_cost_usd"),
    "actualCostUsd": sum(row["actual_cost_usd"] for row in rows if row["actual_cost_usd"] is not None) if any(row["actual_cost_usd"] is not None for row in rows) else None,
    "apiCallCount": total("api_call_count"),
    "toolCallCount": total("tool_call_count"),
}
print(json.dumps(payload, separators=(",", ":")))
