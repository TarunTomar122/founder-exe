---
name: founder-research
description: Research markets, competitors, users, positioning, pricing, and current public evidence with Linkup-backed citations. Use when Founder.exe needs competitor analysis, market mapping, user-language discovery, claim validation, trend research, or fresh evidence for landing-page and go-to-market decisions.
metadata:
  hermes:
    tags: [founder-exe, research, competitors, linkup]
    category: founder-exe
    requires_toolsets: [terminal, file]
---

# Founder Research

Produce a source-grounded research packet for the Founder orchestrator.

## Procedure

1. Restate the decision the research must support.
2. Decompose it into at most four non-overlapping questions.
3. Use every `RUNTIME LINKUP EVIDENCE SET` supplied in the task prompt. The sets separately cover competitors, user evidence, sizing inputs, and communities. Do not collapse a search snippet into a verified fact.
4. Inspect the supplied results and deduplicate canonical URLs.
5. Separate:
   - facts directly supported by a source;
   - inference derived from multiple sources;
   - recommendations for Founder.
6. Calculate market size only when credible inputs exist. Use low/base/high ranges, show the formula, geography or scope, period, currency, confidence, and the URLs supporting each input. Never use “we can capture 1%” as a reachable-market calculation.
7. Produce one `research_report` artifact with both a readable narrative and the required structured `data` object: verdict, decision, ICP, market-size ranges, competitors, signals, positioning, assumptions, and communities.
8. For `UPDATE_REQUEST` or `REVISION_REQUEST`, revise the supplied report instead of restarting. Preserve supported findings, implement the requested change, refresh affected evidence, and return one complete replacement.
9. For `PEER_REVIEW`, create no research artifact. Review the supplied GTM or landing artifact against the approved evidence. Return only concrete `reviewFindings` with severity and observable acceptance criteria. Notes must not trigger churn.

## Evidence rules

- Cite the specific URL supporting each material claim.
- Prefer first-party product/pricing/docs pages and reputable primary sources.
- State when a source is stale, promotional, ambiguous, or inaccessible.
- Do not treat search snippets as proof when the underlying page is required.
- Do not invent revenue, user counts, pricing, market size, quotes, or dates.
- Research the user's described product. Never substitute Founder.exe unless the user explicitly says Founder.exe is the product.

## Output gate

Return a concise summary plus the artifact. If credible evidence is insufficient, say what is missing and do not turn an assumption into a fact.
