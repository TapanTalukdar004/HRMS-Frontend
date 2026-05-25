import Link from "next/link";
import { Logo } from "@/components/Logo";
import { getHomeStats } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "HR Bot · Rapid Innovation",
  description: "Performance tracking + HR document automation for Ruh AI.",
};

const TILES = [
  {
    href: "/teams",
    title: "Teams",
    desc: "Browse teams + cycles. Day-by-day employee progress.",
    icon: "🧑‍🤝‍🧑",
    accent: "from-[#AE00D0] to-[#7B5AFF]",
  },
  {
    href: "/employees",
    title: "Employees",
    desc: "Search any employee. See their performance trend across cycles.",
    icon: "👥",
    accent: "from-[#7B5AFF] to-[#3B82F6]",
  },
  {
    href: "/skills/jd",
    title: "Generate documents",
    desc: "JDs, experience letters, promotion letters, resume screening.",
    icon: "📄",
    accent: "from-[#22C55E] to-[#10B981]",
  },
  {
    href: "/policies",
    title: "Policies",
    desc: "Reference HR policies the bot answers from.",
    icon: "⚙️",
    accent: "from-stone-400 to-stone-500",
  },
];

export default async function LandingPage() {
  const stats = await getHomeStats();
  return (
    <main className="min-h-screen bg-stone-50">
      {/* Light top bar */}
      <header className="border-b border-stone-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Logo variant="wordmark" height={24} priority />
            <span className="hidden sm:inline-flex items-center gap-2 pl-3 ml-1 border-l
                             border-stone-300 text-[11px] uppercase tracking-[0.18em] text-slate-500">
              HR Bot
            </span>
          </Link>
          <Link
            href="/teams"
            className="text-sm font-medium text-white bg-[#AE00D0] hover:bg-[#9100ad]
                       px-4 py-2 rounded-lg transition"
          >
            Open dashboard →
          </Link>
        </div>
      </header>

      {/* Hero — minimal */}
      <section className="max-w-5xl mx-auto px-6 pt-16 pb-6 text-center">
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-slate-900">
          People operations,{" "}
          <span className="bg-gradient-to-r from-[#AE00D0] to-[#7B5AFF] bg-clip-text text-transparent">
            on autopilot
          </span>
          .
        </h1>
        <p className="mt-5 text-slate-600 text-base sm:text-lg max-w-2xl mx-auto">
          The bot ingests Esha&apos;s cycle reports, tracks day-by-day progress,
          surfaces underperformers for HR review, and generates HR documents on demand.
        </p>
      </section>

      {/* Quick stats */}
      <section className="max-w-5xl mx-auto px-6 mb-12">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="Teams" value={stats.total_teams} />
          <Stat label="Cycles" value={stats.total_cycles} />
          <Stat label="Employees" value={stats.total_employees_tracked} />
          <Stat label="Open escalations" value={stats.open_escalations} accent />
        </div>
      </section>

      {/* Navigation tiles */}
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {TILES.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="group relative overflow-hidden bg-white border border-stone-200
                         hover:border-[#AE00D0] hover:shadow-md transition rounded-2xl p-6"
            >
              <div className={`absolute -inset-x-px -top-px h-1 bg-gradient-to-r ${t.accent}`} />
              <div className="flex items-start gap-4">
                <div className="text-3xl leading-none">{t.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-lg font-semibold text-slate-900 group-hover:text-[#AE00D0]">
                    {t.title}
                  </div>
                  <div className="mt-1 text-sm text-slate-500 leading-relaxed">{t.desc}</div>
                </div>
                <div className="text-slate-300 group-hover:text-[#AE00D0] transition">→</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <footer className="border-t border-stone-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 py-6 text-xs text-slate-500 flex justify-between">
          <div>HR Bot · Rapid Innovation</div>
          <div>Internal · No auth · Built on Supabase Postgres</div>
        </div>
      </footer>
    </main>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`bg-white rounded-xl border ${accent && value > 0 ? "border-amber-300 ring-1 ring-amber-100" : "border-stone-200"} p-4`}>
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${accent && value > 0 ? "text-amber-700" : "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}
