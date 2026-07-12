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
3. Use the `RUNTIME LINKUP EVIDENCE` supplied in the task prompt. It was retrieved immediately before this run. Do not launch another search when it is present.
4. Inspect the supplied results and deduplicate canonical URLs.
5. Separate:
   - facts directly supported by a source;
   - inference derived from multiple sources;
   - recommendations for Founder.
6. Produce one `research_report` artifact with competitor table, positioning gaps, user language, risks, recommendation, and source URLs.

## Evidence rules

- Cite the specific URL supporting each material claim.
- Prefer first-party product/pricing/docs pages and reputable primary sources.
- State when a source is stale, promotional, ambiguous, or inaccessible.
- Do not treat search snippets as proof when the underlying page is required.
- Do not invent revenue, user counts, pricing, market size, quotes, or dates.
- Research the user's described product. Never substitute Founder.exe unless the user explicitly says Founder.exe is the product.

## Output gate

Return a concise summary plus the artifact. If credible evidence is insufficient, say what is missing and do not turn an assumption into a fact.
