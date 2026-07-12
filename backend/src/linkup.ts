import { config } from "./config.js";

export type LinkupResult = { name?: string; url?: string; content?: string; type?: string };

export async function searchLinkup(query: string, maxResults = 8) {
  const response = await fetch("https://api.linkup.so/v1/search", {
    method: "POST",
    headers: { authorization: `Bearer ${config.LINKUP_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ q: query, depth: "fast", outputType: "searchResults", maxResults }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Linkup prefetch failed (${response.status})`);
  const body = await response.json() as { results?: LinkupResult[] };
  return (body.results ?? []).slice(0, maxResults).map(({ name, url, content, type }) => ({ name, url, content: content?.slice(0, 1600), type }));
}
