import { Sidebar } from "@/components/Sidebar";
import { getSession, sidebarRole } from "@/lib/session";

const ROLE_LABEL: Record<string, string> = {
  hr: "HR / PM",
  project_manager: "Project Manager",
  employee: "Employee",
};

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // AUTH_MODE=legacy (default) → hrbot_user cookie; AUTH_MODE=shared → Shlok's JWT session. Same shape either way.
  const session = await getSession();
  return (
    <div className="flex min-h-screen">
      <Sidebar
        userName={session?.name ?? "—"}
        userRole={session ? ROLE_LABEL[session.role] ?? "" : ""}
        role={sidebarRole(session?.role)}
      />
      {/* pt-14 on mobile clears the fixed mobile top bar; reset at md+ */}
      <div className="flex-1 min-w-0 pt-14 md:pt-0">{children}</div>
    </div>
  );
}
