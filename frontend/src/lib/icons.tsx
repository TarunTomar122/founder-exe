import { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 18, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconArrowRight = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Base>
);

export const IconArrowUp = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Base>
);

export const IconArrowUpRight = (p: IconProps) => (
  <Base {...p}>
    <path d="M7 17 17 7M8 7h9v9" />
  </Base>
);

export const IconChevronRight = (p: IconProps) => (
  <Base {...p}>
    <path d="m9 6 6 6-6 6" />
  </Base>
);

export const IconChevronDown = (p: IconProps) => (
  <Base {...p}>
    <path d="m6 9 6 6 6-6" />
  </Base>
);

export const IconClose = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Base>
);

export const IconCheck = (p: IconProps) => (
  <Base {...p}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Base>
);

export const IconCheckCircle = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12 2.4 2.4 4.6-4.8" />
  </Base>
);

export const IconSpinner = ({ size = 18, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="spin" {...p}>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.4" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

export const IconSearch = (p: IconProps) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="6" />
    <path d="m20 20-3.4-3.4" />
  </Base>
);

export const IconCode = (p: IconProps) => (
  <Base {...p}>
    <path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" />
  </Base>
);

export const IconRocket = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3c3.5 1.5 5.5 4.5 5.5 8 0 2-.6 3.7-1.5 5H8c-.9-1.3-1.5-3-1.5-5C6.5 7.5 8.5 4.5 12 3Z" />
    <circle cx="12" cy="10" r="1.6" />
    <path d="M8 16c-1.6.8-2.4 2.3-2.5 4 1.7-.1 3.2-.9 4-2.5M16 16c1.6.8 2.4 2.3 2.5 4-1.7-.1-3.2-.9-4-2.5" />
  </Base>
);

export const IconGlobe = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.5 3.8 5.7 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.7-3.8-9S9.5 5.5 12 3Z" />
  </Base>
);

export const IconChart = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6" />
  </Base>
);

export const IconTrend = (p: IconProps) => (
  <Base {...p}>
    <path d="m4 15 5-5 3 3 6-7M15 6h4v4" />
  </Base>
);

export const IconUsers = (p: IconProps) => (
  <Base {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19c.5-3 2.8-4.6 5.5-4.6S14 16 14.5 19M16 5.2A3.2 3.2 0 0 1 16 11.4M18 14.6c1.9.5 3.2 1.9 3.6 4.4" />
  </Base>
);

export const IconCompass = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m15.5 8.5-2 5-5 2 2-5z" />
  </Base>
);

export const IconFile = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4M9 13h6M9 16.5h6" />
  </Base>
);

export const IconFiles = (p: IconProps) => (
  <Base {...p}>
    <path d="M8 4h7l4 4v10H8z" />
    <path d="M15 4v4h4M5 8v12h10" />
  </Base>
);

export const IconMegaphone = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 10v4l3 .5V9.5zM7 9.5 18 5v14L7 14.5M18 8.5c1.5.4 2.5 1.7 2.5 3.5s-1 3.1-2.5 3.5M9 15v3.5c0 .8.6 1.5 1.5 1.5s1.5-.7 1.5-1.5V15.5" />
  </Base>
);

export const IconShield = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3 5 6v5c0 4.4 2.9 7.6 7 9 4.1-1.4 7-4.6 7-9V6z" />
    <path d="M12 8v4M12 15.2v.1" />
  </Base>
);

export const IconClock = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </Base>
);

export const IconLink = (p: IconProps) => (
  <Base {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7l-1.3 1.3" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.3-1.3" />
  </Base>
);

export const IconCopy = (p: IconProps) => (
  <Base {...p}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M4 16V6a2 2 0 0 1 2-2h10" />
  </Base>
);

export const IconDownload = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 4v11M8 11l4 4 4-4M5 19h14" />
  </Base>
);

export const IconRefresh = (p: IconProps) => (
  <Base {...p}>
    <path d="M20 11a8 8 0 0 0-14-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14 4.5L20 16M20 20v-4h-4" />
  </Base>
);

export const IconPlay = ({ size = 18, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M8 5.5v13l11-6.5z" />
  </svg>
);

export const IconExpand = (p: IconProps) => (
  <Base {...p}>
    <path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4" />
  </Base>
);

export const IconCollapse = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 8h4V4M20 8h-4V4M4 16h4v4M20 16h-4v4" />
  </Base>
);

export const IconSound = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 9v6h3l5 4V5L7 9zM16 9.5a3.5 3.5 0 0 1 0 5M18.5 7a7 7 0 0 1 0 10" />
  </Base>
);

export const IconStop = ({ size = 18, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

export const IconTarget = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3.5" />
    <path d="M12 4v3M12 17v3M4 12h3M17 12h3" />
  </Base>
);

export const IconBuilding = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M15 21V9h3a1 1 0 0 1 1 1v11M3 21h18M8 7h3M8 11h3M8 15h3" />
  </Base>
);

export const IconCalendar = (p: IconProps) => (
  <Base {...p}>
    <rect x="4" y="5" width="16" height="16" rx="2" />
    <path d="M4 9h16M8 3v4M16 3v4M8 13h3M8 17h3" />
  </Base>
);

export const IconList = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
  </Base>
);

export const IconShare = (p: IconProps) => (
  <Base {...p}>
    <circle cx="6" cy="12" r="2.4" />
    <circle cx="17" cy="6" r="2.4" />
    <circle cx="17" cy="18" r="2.4" />
    <path d="m8.2 11 6.6-3.6M8.2 13l6.6 3.6" />
  </Base>
);

export const IconSpark = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
    <circle cx="12" cy="12" r="2.4" />
  </Base>
);

export const IconAtom = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="1.6" />
    <path d="M12 4.5c4.5 0 8 3.4 8 7.5s-3.5 7.5-8 7.5-8-3.4-8-7.5 3.5-7.5 8-7.5Z" transform="rotate(60 12 12)" />
    <path d="M12 4.5c4.5 0 8 3.4 8 7.5s-3.5 7.5-8 7.5-8-3.4-8-7.5 3.5-7.5 8-7.5Z" transform="rotate(-60 12 12)" />
  </Base>
);

export const IconLayers = (p: IconProps) => (
  <Base {...p}>
    <path d="m12 4 8 4-8 4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4" />
  </Base>
);

export const IconWarning = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 4 3 19h18zM12 10v4M12 16.5v.1" />
  </Base>
);

export const IconGear = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.5M12 18.5V21M4.2 7l2.2 1.3M17.6 15.7 19.8 17M4.2 17l2.2-1.3M17.6 8.3 19.8 7" />
  </Base>
);

export const IconQuote = (p: IconProps) => (
  <Base {...p}>
    <path d="M8 7c-2 1-3 3-3 6 0 2 1 3 2.5 3S10 15 10 13.5 9 11 7.5 11M18 7c-2 1-3 3-3 6 0 2 1 3 2.5 3S20 15 20 13.5 19 11 17.5 11" />
  </Base>
);

export function SourceFavicon({ url, size = 16 }: { url: string; size?: number }) {
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* ignore */
  }
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
    />
  );
}
