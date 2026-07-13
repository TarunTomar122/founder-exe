import { ReactNode } from "react";
import { RuntimeStatus } from "../lib/core";
import {
  IconArrowRight,
  IconBuilding,
  IconCalendar,
  IconChart,
  IconCode,
  IconCompass,
  IconFile,
  IconGlobe,
  IconMegaphone,
  IconQuote,
  IconRocket,
  IconSearch,
  IconShare,
  IconShield,
  IconTarget,
  IconTrend,
  IconUsers,
} from "../lib/icons";

export function Brand() {
  return (
    <span className="brand" aria-label="founder.exe">
      <span className="brand-mark">
        <IconCode />
      </span>
      founder<span>.exe</span>
    </span>
  );
}

export function StatusDot({ status }: { status: RuntimeStatus }) {
  return <span className={`dot ${status}`} aria-hidden="true" />;
}

export function StatusChip({ status }: { status: RuntimeStatus }) {
  return <em className={`chip ${status}`}>{status}</em>;
}

export function ArtifactIcon({ kind, size = 18 }: { kind: string; size?: number }) {
  if (kind.includes("preview") || kind.includes("landing")) return <IconGlobe size={size} />;
  if (kind.includes("research")) return <IconSearch size={size} />;
  if (kind.includes("gtm") || kind.includes("social")) return <IconRocket size={size} />;
  return <IconFile size={size} />;
}

export function SectionIcon({ title, size = 18 }: { title: string; size?: number }) {
  const value = title.toLowerCase();
  if (/competitor|landscape|alternative/.test(value)) return <IconBuilding size={size} />;
  if (/audience|user|customer|persona|community/.test(value)) return <IconUsers size={size} />;
  if (/risk|threat|warning|constraint/.test(value)) return <IconShield size={size} />;
  if (/position|gap|opportunity|recommend/.test(value)) return <IconTarget size={size} />;
  if (/metric|signal|market|trend|growth/.test(value)) return <IconTrend size={size} />;
  if (/week|day|timeline|sequence|plan|experiment/.test(value)) return <IconCalendar size={size} />;
  if (/channel|distribution|platform/.test(value)) return <IconShare size={size} />;
  if (/message|post|copy|content/.test(value)) return <IconMegaphone size={size} />;
  if (/quote|language|voice/.test(value)) return <IconQuote size={size} />;
  if (/market|model|size/.test(value)) return <IconChart size={size} />;
  return <IconCompass size={size} />;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  compact,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`empty ${compact ? "compact" : ""}`}>
      <span className="empty-icon">{icon}</span>
      <strong>{title}</strong>
      <p>{body}</p>
      {action}
    </div>
  );
}

/** Inline markdown-ish rendering for links + bold within a line. */
export function RichInline({ children }: { children: string }) {
  const parts = children.split(/(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<]+)/g);
  return (
    <>
      {parts.map((part, index) => {
        const markdown = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
        const raw = part.match(/^https?:\/\//) ? part.replace(/[),.;]+$/, "") : null;
        if (markdown)
          return (
            <a href={markdown[2]} target="_blank" rel="noreferrer" key={index}>
              {markdown[1]} <IconArrowRight size={11} />
            </a>
          );
        if (raw) {
          let host = raw;
          try {
            host = new URL(raw).hostname.replace(/^www\./, "");
          } catch {
            /* ignore */
          }
          return (
            <a href={raw} target="_blank" rel="noreferrer" key={index}>
              {host} <IconArrowRight size={11} />
            </a>
          );
        }
        return <span key={index}>{part.replace(/\*\*/g, "")}</span>;
      })}
    </>
  );
}
