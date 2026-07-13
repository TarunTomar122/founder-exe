import assert from "node:assert/strict";
import test from "node:test";
import { extractJson } from "./hermes.js";

test("Hermes JSON extraction repairs punctuation without weakening schemas", () => {
  const parsed = extractJson(`notes before {"summary":"valid" "items":[1,2,3,]} notes after`) as { summary: string; items: number[] };
  assert.equal(parsed.summary, "valid");
  assert.deepEqual(parsed.items, [1, 2, 3]);
});

test("Hermes JSON extraction ignores unrelated tool objects around the result", () => {
  const parsed = extractJson(`tool: {"query":"barbers"}\n\n\`\`\`json\n{"summary":"chosen","response":"ok","artifacts":[],}\n\`\`\`\nmetadata {"elapsed":12}`) as { summary: string };
  assert.equal(parsed.summary, "chosen");
});

test("Hermes JSON extraction repairs an unclosed outer envelope", () => {
  const parsed = extractJson(`{"summary":"chosen","response":"ok","artifacts":{"gtm_strategy":{"data":{"channels":[]}}}`) as { summary: string };
  assert.equal(parsed.summary, "chosen");
});

test("Hermes JSON extraction salvages complete keyed artifacts from a broken envelope", () => {
  const parsed = extractJson(`{"summary":"broken","artifacts":{"gtm_strategy":{"data":{"hypothesis":"test","channels":[]}},"social_posts":{"markdown":"drafts"},"approved":false`) as { artifacts: Record<string, unknown> };
  assert.ok(parsed.artifacts.gtm_strategy);
  assert.ok(parsed.artifacts.social_posts);
});

test("Hermes JSON extraction preserves a direct-string HTML artifact", () => {
  const parsed = extractJson(`{"summary":"page","artifacts":{"landing_page_brief":{"content":"brief"},"landing_page_html":"<!doctype html><html><body>${"x".repeat(220)}</body></html>"`) as { artifacts: Record<string, unknown> };
  assert.match(String(parsed.artifacts.landing_page_html), /<!doctype html>/);
});

test("Hermes JSON extraction accepts the canonical artifact array", () => {
  const parsed = extractJson(JSON.stringify({ summary: "done", response: "ready", artifacts: [{ kind: "landing_page_html", title: "Page", content: "<html><body></body></html>", sourceUrls: [] }], delegatedAgents: [], reviewActions: [], reviewFindings: [], approved: false })) as { response: string };
  assert.equal(parsed.response, "ready");
});
