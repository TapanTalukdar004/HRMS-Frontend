/** Tiny class-list joiner. Equivalent to `clsx` for our needs without the dependency. */
export function clsx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
