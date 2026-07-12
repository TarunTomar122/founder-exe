#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

const [query, limitText = "5"] = process.argv.slice(2);
if (!query) throw new Error("Usage: select-template.mjs <product audience aesthetic> [limit]");
const root = process.env.TEMPLATE_LIBRARY_PATH;
if (!root) throw new Error("TEMPLATE_LIBRARY_PATH is not configured");
const limit = Math.max(1, Math.min(10, Number(limitText) || 5));
const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 2);
const entries = await readdir(root, { recursive: true, withFileTypes: true });
const metadataFiles = entries.filter(entry => entry.isFile() && entry.name === "metadata.json");
const candidates = [];
for (const entry of metadataFiles) {
  const metadataPath = join(entry.parentPath ?? entry.path, entry.name);
  try {
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    const name = metadata.name ?? basename(dirname(metadataPath));
    const haystack = [name, metadata.category, ...(metadata.tags ?? [])].filter(Boolean).join(" ").toLowerCase();
    const score = tokens.reduce((total, token) => total + (haystack.includes(token) ? 3 : 0) + (metadata.name?.includes(token) ? 2 : 0), 0);
    candidates.push({ score, name, category: metadata.category ?? "landing-page", tags: metadata.tags ?? [], metadataPath, promptPath: metadata.promptFile ? join(root, metadata.promptFile) : join(dirname(metadataPath), "prompt.md") });
  } catch { /* skip malformed metadata */ }
}
candidates.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
console.log(JSON.stringify({ query, totalTemplates: candidates.length, candidates: candidates.slice(0, limit) }, null, 2));
