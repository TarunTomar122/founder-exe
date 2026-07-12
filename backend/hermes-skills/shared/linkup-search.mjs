#!/usr/bin/env node
const [query, depth = "standard", maxResultsText = "8"] = process.argv.slice(2);
if (!query) throw new Error("Usage: linkup-search.mjs <query> [fast|standard|deep] [maxResults]");
if (!process.env.LINKUP_API_KEY) throw new Error("LINKUP_API_KEY is not configured");
if (!["fast", "standard", "deep"].includes(depth)) throw new Error("Invalid Linkup depth");
const maxResults = Math.max(1, Math.min(20, Number(maxResultsText) || 8));
const response = await fetch("https://api.linkup.so/v1/search", {
  method: "POST",
  headers: { authorization: `Bearer ${process.env.LINKUP_API_KEY}`, "content-type": "application/json" },
  body: JSON.stringify({ q: query, depth, outputType: "searchResults", maxResults }),
  signal: AbortSignal.timeout(depth === "deep" ? 120_000 : 45_000),
});
if (!response.ok) throw new Error(`Linkup search failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
const body = await response.json();
const results = Array.isArray(body.results) ? body.results : [];
console.log(JSON.stringify({ query, depth, retrievedAt: new Date().toISOString(), results: results.map(({ name, url, content, type }) => ({ name, url, content, type })) }, null, 2));
