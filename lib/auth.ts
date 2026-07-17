/**
 * Simple per-user auth (FOR NOW — testing). One password for everyone (`pass123`),
 * role-based: HR/PM see everyone's report; each employee sees only their own page.
 * Cookie stores the username (httpOnly, set server-side after the password check).
 * NOTE: this is a low-security gate for internal testing — proper hashed passwords /
 * per-user secrets come later.
 */
export type Role = "hr" | "employee";
// `kind: "pm"` marks a Project Manager persona (changes/235): legacy ACCESS stays role="hr" (so the ~15
// `role !== "hr"` gates keep working untouched), but lib/session.ts maps it to the real `project_manager`
// AppSession role — the same value Shlok's JWT `role` claim carries, so PM pages work unchanged when
// AUTH_MODE flips to `shared`. `team` scopes the PM desk (only Agent Builder is active today).
export type Account = { username: string; role: Role; employee?: string; label: string; kind?: "pm"; team?: string };

export const ACCOUNTS: Record<string, Account> = {
  hr: { username: "hr", role: "hr", label: "HR" },
  pm: { username: "pm", role: "hr", label: "PM", kind: "pm", team: "Agent Builder" },
  vaibhav: { username: "vaibhav", role: "employee", employee: "vaibhav", label: "Vaibhav" },
  komal: { username: "komal", role: "employee", employee: "komal", label: "Komal" },
  shruti: { username: "shruti", role: "employee", employee: "shruti", label: "Shruti" },
  shivam: { username: "shivam", role: "employee", employee: "shivam", label: "Shivam" },
  aditya: { username: "aditya", role: "employee", employee: "aditya", label: "Aditya" },
  rishabh: { username: "rishabh", role: "employee", employee: "rishabh", label: "Rishabh" },
};

export const SIMPLE_PASSWORD = "pass123";
export const AUTH_COOKIE = "hrbot_user";

export function accountFor(username: string | undefined | null): Account | null {
  if (!username) return null;
  return ACCOUNTS[username.trim().toLowerCase()] ?? null;
}
