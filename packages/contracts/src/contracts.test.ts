import assert from "node:assert/strict";
import test from "node:test";
import { AgentResultSchema, GtmDataSchema, ResearchDataSchema, WorkerCommandSchema } from "./index.js";

test("research contract keeps sizing math and evidence explicit", () => {
  const data = ResearchDataSchema.parse({
    verdict: "promising", decision: "Test demand before building.", executiveSummary: "A narrow segment has observable pain.",
    icp: { segment: "Independent UK barbers", problem: "No-shows", trigger: "A missed paid slot", currentAlternative: "Manual reminders" },
    marketSize: [{ label: "reachable", valueLow: 1000, valueBase: 2500, valueHigh: 5000, currency: "GBP", period: "annual", formula: "100 shops × £25", confidence: "medium", sourceUrls: ["https://example.com/evidence"] }],
    competitors: [{ name: "Calendar", audience: "Small shops", promise: "Book appointments", pricing: "£10", proof: "Public pricing", gap: "No validation focus", sourceUrls: ["https://example.com/competitor"] }],
    signals: [{ theme: "Lost slots", evidence: "Owners discuss missed appointments", confidence: "medium", sourceUrls: ["https://example.com/signal"] }],
    positioning: { category: "no-show recovery", gap: "Simple recovery", promise: "Fill cancelled slots", risks: ["Unproven willingness to pay"] },
    assumptions: [{ assumption: "Owners will share a waitlist", impact: "high", evidenceStrength: "weak", nextTest: "Run a 14-day waitlist campaign" }],
  });
  assert.equal(data.marketSize[0]?.formula, "100 shops × £25");
});

test("GTM contract requires measurable experiments and safe platform drafts", () => {
  assert.throws(() => GtmDataSchema.parse({ channels: [], experiments: [], posts: [] }));
});

test("peer review findings survive the common agent envelope", () => {
  const result = AgentResultSchema.parse({ summary: "One material claim gap.", response: "Review complete.", artifacts: [], delegatedAgents: [], reviewActions: [], approved: false, reviewFindings: [{ targetAgent: "landing_page", targetArtifactKind: "landing_page_html", severity: "material", feedback: "The headline overstates the evidence.", acceptanceCriteria: "Use the qualified research wording." }] });
  assert.equal(result.reviewFindings[0]?.targetAgent, "landing_page");
});

test("worker command carries stage, task and artifact lineage", () => {
  const command = WorkerCommandSchema.parse({ commandId: "cmd", conversationId: "conversation", message: "Review it", agent: "research", taskType: "peer_review", stage: "cross_review", inputArtifactIds: ["artifact"], context: [] });
  assert.deepEqual([command.taskType, command.stage, command.inputArtifactIds[0]], ["peer_review", "cross_review", "artifact"]);
});
