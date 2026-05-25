import Link from "next/link";
import { clsx } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-[#AE00D0] text-white hover:bg-[#9000AE] shadow-sm",
  secondary:
    "bg-white text-slate-900 ring-1 ring-stone-200 hover:bg-stone-50",
  ghost:
    "text-slate-700 hover:bg-stone-100",
};

const SIZE: Record<Size, string> = {
  sm: "h-8  px-3   text-xs",
  md: "h-10 px-4   text-sm",
  lg: "h-12 px-6   text-sm",
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

type CommonProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
};

type ButtonProps = CommonProps &
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: undefined;
  };

type LinkProps = CommonProps & {
  href: string;
  prefetch?: boolean;
};

export function Button(props: ButtonProps | LinkProps) {
  const variant = props.variant ?? "primary";
  const size = props.size ?? "md";
  const className = clsx(BASE, VARIANT[variant], SIZE[size], props.className);

  if ("href" in props && props.href) {
    const { href, prefetch, children } = props;
    return (
      <Link href={href} prefetch={prefetch} className={className}>
        {children}
      </Link>
    );
  }
  const { variant: _v, size: _s, className: _c, ...rest } = props as ButtonProps;
  return (
    <button className={className} {...rest}>
      {props.children}
    </button>
  );
}
