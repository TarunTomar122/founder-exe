export type ReportSection = { title: string; lines: string[] };

export function cleanMarkdown(value: string) {
  return value
    .replace(/^#{1,6}\s*/, "")
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/\*\*/g, "")
    .trim();
}

export function parseReport(content: string): ReportSection[] {
  const sections: ReportSection[] = [];
  let current: ReportSection = { title: "Overview", lines: [] };
  for (const original of content.split("\n")) {
    const line = original.trim();
    const markdownHeading = line.match(/^#{1,4}\s+(.+)/);
    const plainHeading = line.match(/^([A-Za-z][^:]{2,52}):$/);
    if (markdownHeading || plainHeading) {
      if (current.lines.some(Boolean)) sections.push(current);
      current = { title: cleanMarkdown(markdownHeading?.[1] ?? plainHeading?.[1] ?? "Section"), lines: [] };
    } else if (line) current.lines.push(line);
  }
  if (current.lines.some(Boolean)) sections.push(current);
  return sections.length ? sections : [{ title: "Overview", lines: content.split("\n").filter(Boolean) }];
}

export function sectionSlug(title: string, index: number) {
  return `report-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || index}`;
}
