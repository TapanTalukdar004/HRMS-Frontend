import { Sidebar } from "@/components/Sidebar";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen">
      <Sidebar userName="Tapan Talukdar" userRole="HR Lead · test workspace" />
      {/* pt-14 on mobile clears the fixed mobile top bar; reset at md+ */}
      <div className="flex-1 min-w-0 pt-14 md:pt-0">{children}</div>
    </div>
  );
}
