/**
 * Inline SVG icon set.
 *
 * Path data adapted from Lucide (https://lucide.dev), MIT licensed.
 * Inlined to avoid adding a runtime dependency for a handful of icons.
 *
 * All icons render as 1em currentColor strokes by default so they
 * inherit the surrounding text size and color.  Override with className.
 */
import * as React from "react";

type IconProps = React.SVGProps<SVGSVGElement> & { size?: number };

function makeIcon(displayName: string, body: React.ReactNode) {
  const C = React.forwardRef<SVGSVGElement, IconProps>(
    ({ size = 20, className, ...rest }, ref) => (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
        {...rest}
      >
        {body}
      </svg>
    ),
  );
  C.displayName = displayName;
  return C;
}

/* — Navigation icons — */

export const TeamsIcon = makeIcon("TeamsIcon", (
  <>
    {/* Two overlapping people */}
    <circle cx="9" cy="7" r="3" />
    <path d="M3 21v-1a6 6 0 0 1 12 0v1" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M14 21v-.5a4.5 4.5 0 0 1 8-3.5" />
  </>
));

export const EmployeesIcon = makeIcon("EmployeesIcon", (
  <>
    {/* User circle */}
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21v-1.5A6.5 6.5 0 0 1 10.5 13h3A6.5 6.5 0 0 1 20 19.5V21" />
  </>
));

export const FileTextIcon = makeIcon("FileTextIcon", (
  <>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M8 13h8" />
    <path d="M8 17h6" />
  </>
));

export const ScrollIcon = makeIcon("ScrollIcon", (
  <>
    <path d="M19 17V5a2 2 0 0 0-2-2H4" />
    <path d="M21 7H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
    <path d="M9 11h8" />
    <path d="M9 15h6" />
  </>
));

export const AwardIcon = makeIcon("AwardIcon", (
  <>
    <circle cx="12" cy="9" r="6" />
    <path d="M8.5 13.5L7 22l5-3 5 3-1.5-8.5" />
  </>
));

export const BotIcon = makeIcon("BotIcon", (
  <>
    <rect x="4" y="7" width="16" height="12" rx="2.5" />
    <path d="M12 2v3" />
    <circle cx="9" cy="13" r="1" fill="currentColor" />
    <circle cx="15" cy="13" r="1" fill="currentColor" />
    <path d="M2 14v2" />
    <path d="M22 14v2" />
  </>
));

export const SettingsIcon = makeIcon("SettingsIcon", (
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </>
));

/* — Utility icons — */

export const ChevronLeftIcon = makeIcon("ChevronLeftIcon", (
  <path d="M15 18l-6-6 6-6" />
));

export const ChevronRightIcon = makeIcon("ChevronRightIcon", (
  <path d="M9 18l6-6-6-6" />
));

export const ArrowLeftIcon = makeIcon("ArrowLeftIcon", (
  <>
    <path d="M19 12H5" />
    <path d="M12 19l-7-7 7-7" />
  </>
));
