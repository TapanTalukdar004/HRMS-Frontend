import { clsx } from "@/lib/cn";

type Tone =
  | "neutral"
  | "brand"
  | "accent"
  | "emerald"
  | "amber"
  | "blue"
  | "rose";

const TONE: Record<Tone, string> = {
  neutral: "bg-stone-100 text-stone-700 ring-stone-200",
  brand:   "bg-[#fdf0ff] text-[#AE00D0] ring-[#f5d4ff]",
  accent:  "bg-[#f0ebff] text-[#6745E8] ring-[#dcd1ff]",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber:   "bg-amber-50 text-amber-700 ring-amber-200",
  blue:    "bg-blue-50 text-blue-700 ring-blue-200",
  rose:    "bg-rose-50 text-rose-700 ring-rose-200",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
        "text-[10px] font-medium uppercase tracking-wider ring-1 ring-inset",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
