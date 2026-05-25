/**
 * Renders the official RUH AI logo. Three variants:
 *   - "wordmark"        — dark wordmark (default), for use on light bgs
 *   - "wordmark-white"  — white wordmark, for use on dark bgs
 *   - "icon"            — small purple icon mark only (square)
 *
 * SVGs live in /public/brand/ — pulled directly from ruh.ai's
 * canonical asset set in change 028. Plain <img> is intentional
 * (SVGs are already optimal; <Image> adds dangerouslyAllowSVG friction).
 */
import { clsx } from "@/lib/cn";

type Variant = "wordmark" | "wordmark-white" | "icon";

const SRC: Record<Variant, string> = {
  "wordmark":       "/brand/ruh-dark.svg",
  "wordmark-white": "/brand/ruh-white.svg",
  "icon":           "/brand/ruh-icon.svg",
};

export function Logo({
  variant = "wordmark",
  height = 28,
  className,
  alt = "RUH AI",
}: {
  variant?: Variant;
  /** Render height in px. Width auto-scales from native aspect ratio. */
  height?: number;
  className?: string;
  alt?: string;
  /** Reserved for future use; currently a no-op since plain <img> doesn't need it. */
  priority?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={SRC[variant]}
      alt={alt}
      style={{ height }}
      className={clsx("brand-mark block w-auto select-none", className)}
      draggable={false}
    />
  );
}
