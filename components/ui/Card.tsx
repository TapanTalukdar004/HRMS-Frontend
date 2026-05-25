import { clsx } from "@/lib/cn";

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Removes the default padding for cards that need to nest tables/lists flush. */
  flush?: boolean;
};

export function Card({ className, flush, ...rest }: CardProps) {
  return (
    <div
      className={clsx(
        "rounded-2xl bg-white ring-1 ring-stone-200/80 shadow-[0_1px_2px_0_rgb(0_0_0_/_0.04)]",
        flush ? "" : "p-6",
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({
  title,
  description,
  right,
  className,
}: {
  title: string;
  description?: string;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex items-start justify-between gap-4 mb-5", className)}>
      <div>
        <h2 className="text-base font-semibold tracking-tight text-slate-900">
          {title}
        </h2>
        {description && (
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
