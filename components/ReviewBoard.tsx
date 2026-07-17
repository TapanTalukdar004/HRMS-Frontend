"use client";

/**
 * ReviewBoard — beautiful, consistent per-PR review cards (left accent stripe by verdict,
 * labeled fields, expandable full review). Findings are MUST-FIX only (the fixer's queue);
 * everything minor lives in a one-line note. Click a card → parent lights up its modules on
 * the codebase map. Clean PRs say "nothing to fix".
 */

import { useState } from "react";
import type { Review, ReviewOverview } from "@/lib/reviewQueries";

const V: Record<string, { accent: string; word: string; cls: string }> = {
  clean: { accent: "border-l-emerald-400", word: "Looks good", cls: "text-emerald-600" },
  "needs-changes": { accent: "border-l-amber-400", word: "Needs changes", cls: "text-amber-600" },
  blocked: { accent: "border-l-rose-400", word: "Blocked", cls: "text-rose-600" },
};
const sevDot = (s: string) => (s === "critical" ? "bg-rose-500" : "bg-amber-500");

function Card({ r, selected, onSelect }: { r: Review; selected: boolean; onSelect: () => void }) {
  const [open, setOpen] = useState(false);
  const v = V[r.verdict ?? ""] ?? { accent: "border-l-slate-300", word: r.verdict ?? "—", cls: "text-slate-600" };
  const isHard = (f: typeof r.findings[number]) =>
    (f.severity || "").toLowerCase() === "critical" || (f.conf_tier ?? "high") !== "low";
  const mustFix = r.findings.filter(isHard).length;   // only CONFIDENT findings count as "to fix"
  const worthALook = r.findings.length - mustFix;      // low-confidence ones = "worth a look"
  return (
    <div onClick={onSelect}
      className={`rounded-xl border border-stone-200 border-l-4 ${v.accent} bg-white overflow-hidden cursor-pointer transition-shadow ${selected ? "ring-1 ring-[#AE00D0] shadow-sm" : "hover:shadow-sm"}`}>
      <div className="flex items-start gap-4 px-4 pt-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[12px] text-slate-400">
            <span className="font-mono">#{r.pr_number}</span><span>·</span><span className="truncate">{r.author ?? "—"}</span>
          </div>
          <div className="text-[15px] font-semibold text-slate-900 leading-snug truncate" title={r.title ?? ""}>{r.title ?? "—"}</div>
          <p className="mt-1 text-[13.5px] text-slate-700 leading-snug">{r.verdict_line}</p>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-lg font-bold leading-none ${v.cls}`}>{v.word}</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mt-1">{mustFix ? `${mustFix} to fix` : "no fix needed"}</div>
        </div>
      </div>

      {/* multi-pass loop strip — confidence, runs, injection flag (only for loop-reviewed PRs) */}
      {r.loop_version && (
        <div className="mx-4 mt-3 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-full bg-[#fdf0ff] text-[#AE00D0] px-2 py-0.5 font-medium">✓ multi-pass loop</span>
          <span className="text-slate-500">confidence <b className="text-slate-700">{r.confidence != null ? Math.round(r.confidence * 100) + "%" : "—"}</b> · {r.samples_k ?? "?"} independent runs</span>
          {r.injection_attempt && <span className="rounded-full bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 px-2 py-0.5 font-semibold uppercase tracking-wider">⚠ injection flagged</span>}
          {r.quality_outlier && <span className="text-slate-400">· score outlier ignored</span>}
        </div>
      )}

      {/* labeled fields — clear meaning */}
      <div className="grid grid-cols-3 gap-px bg-stone-100 mt-3 border-t border-stone-100">
        <div className="bg-white px-4 py-2.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Code quality</div>
          <div className="text-[15px] font-semibold text-slate-800">{r.code_quality ?? "—"}<span className="text-[11px] text-slate-400">/10</span></div>
          <div className="text-[11px] text-slate-500">how clean &amp; correct</div>
        </div>
        <div className="bg-white px-4 py-2.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Matches its title</div>
          <div className={`text-[15px] font-semibold ${r.matches_title ? "text-emerald-600" : "text-rose-600"}`}>{r.matches_title ? "Yes" : "No"}</div>
          <div className="text-[11px] text-slate-500">does what it claims</div>
        </div>
        <div className="bg-white px-4 py-2.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Reach</div>
          <div className="text-[15px] font-semibold text-slate-800">{r.reached_modules.length} <span className="text-[11px] font-normal text-slate-400">modules</span></div>
          <div className="text-[11px] text-slate-500">{r.touches_sensitive ? "incl. sensitive code" : "no sensitive areas"}</div>
        </div>
      </div>

      <button onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="w-full text-left px-4 py-2 border-t border-stone-100 text-[12.5px] text-slate-600 hover:bg-stone-50">
        {open ? "▾" : "▸"} Full review &amp; fixes{mustFix ? ` (${mustFix} must-fix)` : ""}
        <span className="ml-2 text-[11px] text-[#AE00D0]">· click card to show reach on map</span>
      </button>

      {open && (
        <div className="px-4 py-3 border-t border-stone-100 bg-stone-50/40 space-y-2.5 text-[13px] leading-relaxed">
          {r.what_it_does && <p className="text-slate-600"><span className="font-medium text-slate-800">What it does:</span> {r.what_it_does}</p>}
          {!r.matches_title && r.matches_note && <p className="text-slate-600"><span className="font-medium text-rose-700">Doesn&apos;t match title:</span> {r.matches_note}</p>}
          {r.blast_prose && <p className="text-slate-600"><span className="font-medium text-slate-800">Blast radius:</span> {r.blast_prose}</p>}

          {(r.changed_modules.length > 0 || r.reached_modules.length > 0) && (
            <div className="text-[12px]">
              <div className="text-slate-600 mb-1"><span className="font-medium text-violet-700">Changed {r.changed_modules.length} module{r.changed_modules.length === 1 ? "" : "s"}</span> → impacts <span className="font-medium text-amber-700">{r.reached_modules.length}</span> downstream</div>
              <div className="flex flex-wrap gap-1">
                {r.changed_modules.slice(0, 8).map((m) => <span key={"c" + m} className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 text-[10px]" title={m}>{m.split("/").slice(-2).join("/")}</span>)}
                {r.reached_modules.slice(0, 12).map((m) => <span key={"r" + m} className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px]" title={m}>{m.split("/").slice(-2).join("/")}</span>)}
                {r.reached_modules.length > 12 && <span className="text-[10px] text-slate-400 self-center">+{r.reached_modules.length - 12} more</span>}
              </div>
              <div className="text-[10.5px] text-slate-400 mt-1">click the card → these light up on the codebase map (violet = changed · amber = reached)</div>
            </div>
          )}

          <div>
            <div className="text-[11px] font-medium text-slate-500 mb-1.5">What to fix{worthALook > 0 ? ` · ${mustFix} confident, ${worthALook} worth a look` : ""}</div>
            {r.findings.length === 0 ? (
              <div className="text-[12.5px] text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">Nothing to fix — the fixer leaves this PR alone.</div>
            ) : (
              <div className="space-y-2">
                {r.findings.map((f, i) => (
                  <div key={i} className="rounded-lg border border-stone-200 bg-white p-2.5">
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className={`w-1.5 h-1.5 rounded-full ${sevDot(f.severity)}`} />
                      <span className="font-medium text-slate-700 uppercase">{f.type} · {f.severity}</span>
                      {(f.conf_tier ?? "high") === "low" && <span className="rounded-full bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 px-1.5 py-0.5 text-[9px] uppercase tracking-wider">worth a look · unconfirmed</span>}
                      {f.confidence_runs && <span className="ml-auto text-[10px] text-slate-400">seen in {f.confidence_runs} runs</span>}
                    </div>
                    <div className="text-[13px] text-slate-800 mt-1">{f.title}</div>
                    {f.why && <div className="text-[12px] text-slate-500">{f.why}</div>}
                    {f.evidence && (
                      <div className="mt-1.5">
                        <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">Quoted from the diff</div>
                        <pre className="text-[11px] font-mono whitespace-pre-wrap bg-slate-900 text-slate-100 rounded px-2 py-1.5 overflow-x-auto">{f.evidence}</pre>
                      </div>
                    )}
                    <div className="text-[12.5px] text-slate-700 mt-1.5 bg-fuchsia-50 rounded px-2 py-1.5"><span className="font-medium text-[#7E22CE]">Fix →</span> {f.fix}</div>
                    {f.verify_why && <div className="text-[11.5px] text-slate-500 mt-1"><span className="font-medium text-emerald-700">Verified:</span> {f.verify_why}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {r.notes && <p className="text-[12px] text-slate-500"><span className="font-medium">Minor notes:</span> {r.notes}</p>}
          {r.strengths.length > 0 && <p className="text-[12px] text-emerald-700"><span className="font-medium">What&apos;s good:</span> {r.strengths.join(" · ")}</p>}
        </div>
      )}
    </div>
  );
}

export function ReviewBoard({
  reviews, overview, selected, onSelect,
}: {
  reviews: Review[]; overview: ReviewOverview;
  selected: number | null; onSelect: (pr: number) => void;
}) {
  const [filter, setFilter] = useState<"all" | "attention">("all");
  const [howOpen, setHowOpen] = useState(false);
  const shown = filter === "attention" ? reviews.filter((r) => r.verdict !== "clean") : reviews;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="PRs analyzed" value={overview.reviewed} />
        <Stat label="Need a fix" value={overview.need_changes} color="#D97706" />
        <Stat label="Don't match title" value={overview.mismatch} color="#E11D48" />
        <Stat label="Must-fix findings" value={overview.findings_total} color="#7C3AED" />
      </div>

      <button onClick={() => setHowOpen((o) => !o)} className="text-[12px] text-slate-500 hover:text-slate-700">
        {howOpen ? "▾" : "▸"} How these are calculated
      </button>
      {howOpen && (
        <div className="rounded-xl border border-stone-200 bg-stone-50/50 p-4 text-[12.5px] text-slate-600 leading-relaxed space-y-1">
          <p><b className="text-slate-800">Code quality (0–10):</b> the AI reviewer&apos;s read of how correct, clean and safe the diff is — lower for bugs, missing edge-cases, or risky changes to far-reaching code.</p>
          <p><b className="text-slate-800">Matches its title:</b> does the diff actually do what the title + description claim (a ~70%+ honest match counts as yes).</p>
          <p><b className="text-slate-800">Reach:</b> how many modules the change connects to in the codebase graph — &quot;sensitive&quot; means it reaches auth / security / credential code.</p>
          <p><b className="text-slate-800">Must-fix findings:</b> only genuine problems — a bug that errors/crashes, a security hole, broken callers, or a severe title mismatch. Style/refactor/nits are <i>not</i> findings (they go in &quot;minor notes&quot;), so most good PRs show zero. This is exactly what the fixer agent acts on.</p>
        </div>
      )}

      <div className="flex gap-1.5 text-[12px]">
        {(["all", "attention"] as const).map((k) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`px-2.5 py-1 rounded ${filter === k ? "bg-[#AE00D0] text-white" : "bg-stone-100 text-slate-600 hover:bg-stone-200"}`}>
            {k === "all" ? `All (${reviews.length})` : `Needs a fix (${reviews.filter((r) => r.verdict !== "clean").length})`}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {shown.map((r) => <Card key={r.pr_number} r={r} selected={selected === r.pr_number} onSelect={() => onSelect(r.pr_number)} />)}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white px-3 py-2.5">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="text-xl font-bold tabular-nums" style={{ color: color ?? "#1e293b" }}>{value}</div>
    </div>
  );
}
