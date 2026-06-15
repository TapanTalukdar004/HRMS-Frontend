import {
  getLabData, finalScore, LAB_REPO,
  type LabIssue, type LabEvidence, type LabAssessment, type LabPr, type ScoreParts,
} from "@/lib/labQueries";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Agent Lab · HR Bot",
};

// ─── Formatting helpers ─────────────────────────────────────────────────────

/** Compact factor formatting: 1 → "1", 0.7 → "0.7", 0.9625 → "0.96". */
function fmt(n: number): string {
  return Number(n.toFixed(2)).toString();
}

/** covers_requirement / confidence may be stored 0..1 or 0..100. */
function pct(v: number | null): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const p = v <= 1 ? v * 100 : v;
  return `${Math.round(p)}%`;
}

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function relTime(v: string | null): string {
  if (!v) return "—";
  const t = new Date(v).getTime();
  if (Number.isNaN(t)) return String(v);
  const mins = Math.floor((Date.now() - t) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(v).toLocaleDateString();
}

/** Sort AB-1, AB-2, … numerically (prefix first, then number). */
function issueOrder(a: LabIssue, b: LabIssue): number {
  const parse = (k: string): [string, number] => {
    const m = /^([A-Za-z]+)-(\d+)$/.exec(k.trim());
    return m ? [m[1].toUpperCase(), parseInt(m[2], 10)] : [k.toUpperCase(), Number.MAX_SAFE_INTEGER];
  };
  const [pa, na] = parse(a.issue_key);
  const [pb, nb] = parse(b.issue_key);
  return pa === pb ? na - nb : pa.localeCompare(pb);
}

// ─── Chips ──────────────────────────────────────────────────────────────────

const CHIP_BASE =
  "inline-flex items-center gap-1 text-[11px] uppercase tracking-wide ring-1 ring-inset rounded-full px-2 py-0.5 whitespace-nowrap";

function labelChip(label: string | null) {
  if (!label) return null;
  const tone =
    label === "Feature" ? "bg-sky-50 text-sky-700 ring-sky-200"
    : label === "Bug"   ? "bg-rose-50 text-rose-700 ring-rose-200"
    :                     "bg-stone-100 text-slate-600 ring-stone-300";
  return <span className={`${CHIP_BASE} ${tone}`}>{label}</span>;
}

const BUCKET_TONES: Record<string, string> = {
  confirmed:   "bg-emerald-50 text-emerald-700 ring-emerald-200",
  unproven:    "bg-rose-50 text-rose-700 ring-rose-200",
  untracked:   "bg-amber-50 text-amber-800 ring-amber-200",
  in_flight:   "bg-sky-50 text-sky-700 ring-sky-200",
  no_evidence: "bg-stone-100 text-slate-600 ring-stone-300",
};

function bucketChip(bucket: string | null) {
  if (!bucket) {
    return <span className={`${CHIP_BASE} bg-stone-100 text-slate-500 ring-stone-300`}>no snapshot</span>;
  }
  const tone = BUCKET_TONES[bucket] ?? "bg-stone-100 text-slate-600 ring-stone-300";
  return <span className={`${CHIP_BASE} ${tone}`}>{bucket.replace(/_/g, " ")}</span>;
}

function ciChip(ci: string | null) {
  const v = (ci ?? "").trim().toLowerCase();
  if (!v || v === "none" || v === "no_ci" || v === "unknown") {
    return <span className={`${CHIP_BASE} bg-stone-100 text-slate-500 ring-stone-300`}>no CI</span>;
  }
  if (["success", "passed", "passing", "green"].includes(v)) {
    return <span className={`${CHIP_BASE} bg-emerald-50 text-emerald-700 ring-emerald-200`}>CI {v}</span>;
  }
  if (["failure", "failed", "failing", "error", "red"].includes(v)) {
    return <span className={`${CHIP_BASE} bg-rose-50 text-rose-700 ring-rose-200`}>CI {v}</span>;
  }
  if (["pending", "in_progress", "running", "queued"].includes(v)) {
    return <span className={`${CHIP_BASE} bg-amber-50 text-amber-800 ring-amber-200`}>CI {v}</span>;
  }
  return <span className={`${CHIP_BASE} bg-stone-100 text-slate-600 ring-stone-300`}>CI {v}</span>;
}

// ─── Card sections (server-side components) ─────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2">
      {children}
    </div>
  );
}

function ClaimColumn({ issue }: { issue: LabIssue }) {
  return (
    <div className="p-5">
      <SectionLabel>Linear claim</SectionLabel>
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <span className="font-mono text-sm font-semibold text-slate-900">{issue.issue_key}</span>
        {labelChip(issue.label)}
      </div>
      <div className="text-sm font-medium text-slate-800 mb-3">
        {issue.title ?? <span className="italic text-slate-400">untitled</span>}
      </div>
      <dl className="text-xs text-slate-500 space-y-1">
        <div className="flex gap-2">
          <dt className="w-16 text-slate-400">Status</dt>
          <dd className="text-slate-700 font-medium">{issue.status ?? "—"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 text-slate-400">Estimate</dt>
          <dd className="text-slate-700">{issue.estimate ?? "—"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 text-slate-400">Priority</dt>
          <dd className="text-slate-700">{issue.priority ?? "none"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 text-slate-400">Assignee</dt>
          <dd className="text-slate-700">{issue.assignee ?? "—"}</dd>
        </div>
      </dl>
      {issue.relates_to && issue.relates_to.length > 0 && (
        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-slate-400">relates to</span>
          {issue.relates_to.map((k) => (
            <span key={k} className="font-mono text-[11px] bg-stone-100 text-slate-600 ring-1 ring-inset ring-stone-200 rounded px-1.5 py-0.5">
              {k}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function PrRow({ pr }: { pr: LabPr }) {
  return (
    <div className="rounded-lg border border-stone-100 bg-stone-50/60 px-3 py-2 mb-2">
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="font-mono font-semibold text-slate-800">PR #{pr.pr_number}</span>
        {pr.merged_at ? (
          <span className="text-slate-500">merged {fmtDate(pr.merged_at)}</span>
        ) : (
          <span className="text-slate-400 italic">{pr.draft ? "draft" : pr.state ?? "open"}</span>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[11px]">
        <span className="font-mono">
          <span className="text-emerald-600">+{pr.additions ?? 0}</span>
          {" / "}
          <span className="text-rose-600">−{pr.deletions ?? 0}</span>
        </span>
        <span className="text-slate-500">
          {pr.review_approvals ?? 0} approval{(pr.review_approvals ?? 0) === 1 ? "" : "s"}
        </span>
        {ciChip(pr.ci_status)}
      </div>
      {pr.self_merged && (
        <div className="mt-1 text-[11px] text-amber-700">self-merged — no independent review</div>
      )}
    </div>
  );
}

function ProofColumn({ evidence, linkedPrs }: { evidence: LabEvidence | null; linkedPrs: LabPr[] }) {
  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-2">
        <SectionLabel>GitHub proof</SectionLabel>
        {bucketChip(evidence?.bucket ?? null)}
      </div>
      {linkedPrs.length > 0 ? (
        linkedPrs.map((pr) => <PrRow key={pr.pr_number} pr={pr} />)
      ) : (
        <div className="text-xs text-slate-400 italic mb-2">No PRs linked to this issue.</div>
      )}
      {evidence?.net_loc !== null && evidence?.net_loc !== undefined && (
        <div className="text-[11px] text-slate-500 mb-1">
          Net LOC: <span className="font-mono text-slate-700">{evidence.net_loc}</span>
        </div>
      )}
      {evidence?.reasons && evidence.reasons.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[11px] text-slate-500 list-disc list-inside">
          {evidence.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      {evidence && (
        <div className="mt-2 text-[10px] text-slate-400">snapshot {evidence.snapshot_date}</div>
      )}
    </div>
  );
}

function VerdictColumn({ assessment }: { assessment: LabAssessment | null }) {
  if (!assessment) {
    return (
      <div className="p-5">
        <SectionLabel>Agent verdict</SectionLabel>
        <div className="text-sm text-slate-400 italic">Not yet judged.</div>
      </div>
    );
  }
  // SHORT, scannable verdict: a one-word label + one-line summary up top;
  // the full flags / defects / narrative are tucked behind "Details ▾" so the
  // card stays clean. Anyone can glance the headline, click to dig in.
  const q = assessment.code_quality;
  const verdict = q === null ? { word: "Not judged", cls: "bg-stone-100 text-stone-500" }
    : q >= 7 ? { word: "Solid", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" }
    : q >= 5 ? { word: "Mixed", cls: "bg-amber-50 text-amber-800 ring-amber-200" }
    : { word: "Needs work", cls: "bg-rose-50 text-rose-700 ring-rose-200" };
  const nDefects = assessment.defects_found?.length ?? 0;
  // the narrative IS the plain-language "why this score" (kept short by the agent)
  const oneLiner = assessment.narrative
    ? assessment.narrative.slice(0, 240)
    : (nDefects > 0 ? `${nDefects} issue${nDefects > 1 ? "s" : ""} found` : null);
  const hasDetail = (assessment.truthfulness_flags?.length ?? 0) > 0 || nDefects > 0;
  return (
    <div className="p-5">
      <SectionLabel>Agent verdict</SectionLabel>
      <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
        <div className="text-2xl font-semibold text-slate-900">
          {q !== null ? q.toFixed(1) : "—"}
          <span className="text-sm font-normal text-slate-400">/10</span>
        </div>
        <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ring-1 ring-inset ${verdict.cls}`}>
          {verdict.word}
        </span>
        {nDefects > 0 && (
          <span className="text-[11px] font-medium text-rose-600">🐞 {nDefects}</span>
        )}
      </div>
      {oneLiner && (
        <p className={`text-xs leading-snug ${nDefects > 0 ? "text-rose-700" : "text-slate-600"}`}>{oneLiner}</p>
      )}
      {hasDetail && (
        <details className="mt-2 group">
          <summary className="text-[11px] text-[#AE00D0] cursor-pointer list-none select-none hover:underline">
            Details ▾
          </summary>
          <div className="mt-2 space-y-2 border-l-2 border-stone-100 pl-3">
            <div className="text-[11px] text-slate-500">
              covers {pct(assessment.covers_requirement)} · confidence {pct(assessment.confidence)}
            </div>
            {assessment.truthfulness_flags && assessment.truthfulness_flags.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {assessment.truthfulness_flags.map((f, i) => (
                  <span key={i} className="text-[10px] uppercase tracking-wide bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200 rounded-full px-1.5 py-0.5">
                    {f.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            )}
            {nDefects > 0 && (
              <ul className="space-y-0.5 text-[11px] text-slate-600 list-disc list-inside">
                {assessment.defects_found!.map((d, i) => (<li key={i}>{d}</li>))}
              </ul>
            )}
            <div className="text-[10px] text-slate-400">
              run {assessment.run_date}
              {assessment.model_version ? ` · ${assessment.model_version}` : ""}
              {assessment.human_verdict ? ` · human: ${assessment.human_verdict}` : ""}
            </div>
          </div>
        </details>
      )}
    </div>
  );
}

function Factor({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex flex-col items-center px-1">
      <span className="text-[9px] uppercase tracking-wider text-slate-400">{label}</span>
      <span className="font-mono text-sm text-slate-700">{value}</span>
    </span>
  );
}

function ScoreStrip({ parts }: { parts: ScoreParts }) {
  const times = <span className="text-slate-300 text-sm">×</span>;
  return (
    <div className="border-t border-stone-100 bg-stone-50/60 px-5 py-2.5 flex items-center gap-1.5 flex-wrap">
      <Factor label="weight" value={fmt(parts.weight)} />
      {times}
      <Factor label="status" value={parts.status === null ? "—" : fmt(parts.status)} />
      {times}
      <Factor label="bug" value={fmt(parts.bug)} />
      {times}
      <Factor label="evidence" value={fmt(parts.evidence)} />
      {times}
      <Factor label="quality" value={fmt(parts.quality)} />
      <span className="text-slate-300 text-sm">=</span>
      {parts.score === null ? (
        <span className="inline-flex flex-col items-center px-1">
          <span className="text-[9px] uppercase tracking-wider text-slate-400">score</span>
          <span className="font-mono text-sm text-slate-400 italic">canceled — excluded</span>
        </span>
      ) : (
        <span className="inline-flex flex-col items-center px-1">
          <span className="text-[9px] uppercase tracking-wider text-[#AE00D0]">score</span>
          <span className="font-mono text-base font-semibold text-[#AE00D0]">{fmt(parts.score)}</span>
        </span>
      )}
    </div>
  );
}

function EmptyState() {
  const steps: Array<{ name: string; cmds: string[]; what: string }> = [
    {
      name: "1 · Collect",
      cmds: [
        `python -m perf_tracker.github_collect --repo ${LAB_REPO}`,
        "python -m perf_tracker.lab_linear_collect",
      ],
      what: "Fetches PRs, reviews and CI facts from GitHub plus AB-1..AB-6 claims from the TestRuh Linear workspace into the lab tables.",
    },
    {
      name: "2 · Reconcile",
      cmds: [`python -m perf_tracker.lab_evidence --repo ${LAB_REPO}`],
      what: "Buckets every Linear claim against GitHub proof (confirmed / unproven / untracked / in_flight / no_evidence) and writes evidence factors.",
    },
    {
      name: "3 · Agent",
      cmds: [`python -m perf_tracker.lab_agent --repo ${LAB_REPO}`],
      what: "Claude CLI reads each merged PR's code against the issue requirement and records a bounded quality verdict.",
    },
  ];
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-8 text-center">
      <div className="text-4xl mb-3">🧪</div>
      <div className="text-lg font-medium text-slate-800">No GitHub data collected yet.</div>
      <p className="text-sm text-slate-500 mt-1 mb-6">
        Run the three lab stages against the practice repo, then refresh this page.
      </p>
      <div className="max-w-2xl mx-auto text-left space-y-3">
        {steps.map((s) => (
          <div key={s.name} className="rounded-lg border border-stone-100 bg-stone-50/60 p-4">
            <div className="text-xs font-semibold text-[#AE00D0] uppercase tracking-wider mb-1">{s.name}</div>
            {s.cmds.map((cmd) => (
              <code
                key={cmd}
                className="block font-mono text-[12px] text-slate-800 bg-white border border-stone-200 rounded px-2 py-1.5 mb-2 overflow-x-auto"
              >
                {cmd}
              </code>
            ))}
            <div className="text-xs text-slate-500">{s.what}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HowItWorks() {
  return (
    <div className="mt-10 bg-white rounded-xl border border-stone-200 p-6">
      <h2 className="text-sm font-semibold text-slate-800 mb-3">How this works</h2>
      <ul className="space-y-2 text-sm text-slate-600 list-disc list-inside">
        <li>
          <span className="font-medium text-slate-800">Collector fetches facts</span> — PRs, reviews
          and CI from GitHub; issue claims (status, estimate, priority) from Linear.
        </li>
        <li>
          <span className="font-medium text-slate-800">Reconciler buckets claim vs proof</span> — every
          issue lands in confirmed, unproven, untracked, in_flight or no_evidence, with reasons.
        </li>
        <li>
          <span className="font-medium text-slate-800">Claude CLI judges the code</span> — reads the
          merged diff against the issue requirement and scores quality, coverage and truthfulness.
        </li>
        <li>
          <span className="font-medium text-slate-800">The equation stays deterministic</span> — weight,
          status, bug and evidence factors are pure rules; the agent only multiplies a bounded quality
          factor (0.85–1.0).
        </li>
      </ul>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default async function LabPage() {
  const { issues, evidenceByIssue, assessmentByIssue, prs, lastRun } =
    await getLabData(LAB_REPO);

  const sorted = [...issues].sort(issueOrder);
  const prByNumber = new Map(prs.map((p) => [p.pr_number, p]));

  const linkedPrsFor = (issue: LabIssue, ev: LabEvidence | null): LabPr[] => {
    const nums = new Set<number>(ev?.linked_prs ?? []);
    const key = issue.issue_key.toUpperCase();
    for (const p of prs) {
      if ((p.linked_issue_keys ?? []).some((k) => k.toUpperCase() === key)) nums.add(p.pr_number);
    }
    return [...nums]
      .sort((a, b) => a - b)
      .map((n) => prByNumber.get(n))
      .filter((p): p is LabPr => p !== undefined);
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
      {/* Header */}
      <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 flex items-center gap-3">
            Agent Lab
            <span className="text-[10px] uppercase tracking-wider bg-[#fdf0ff] text-[#AE00D0] ring-1 ring-inset ring-[#efc6fb] rounded-full px-2 py-1 font-bold">
              Trial
            </span>
          </h1>
          <p className="mt-1 text-slate-500 text-sm">
            Claim vs proof — practice repo {LAB_REPO} · TestRuh workspace. Not part of production scoring.
          </p>
        </div>
        {lastRun && (
          <div className="text-xs text-slate-400 text-right">
            <div>
              Last run{lastRun.kind ? ` (${lastRun.kind})` : ""}:{" "}
              <span className="text-slate-600 font-medium">
                {relTime(lastRun.finished_at ?? lastRun.started_at)}
              </span>
            </div>
            <div className="mt-0.5">
              {lastRun.items ?? 0} item{(lastRun.items ?? 0) === 1 ? "" : "s"} ·{" "}
              {lastRun.ok === false ? (
                <span className="text-rose-600 font-medium">failed</span>
              ) : (
                <span className="text-emerald-600 font-medium">ok</span>
              )}
            </div>
          </div>
        )}
      </div>

      {prs.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-5">
          {sorted.map((issue) => {
            const ev = evidenceByIssue[issue.issue_key] ?? null;
            const assessment = assessmentByIssue[issue.issue_key] ?? null;
            const parts = finalScore(issue, ev, assessment);
            return (
              <div key={issue.issue_key} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-stone-100">
                  <ClaimColumn issue={issue} />
                  <ProofColumn evidence={ev} linkedPrs={linkedPrsFor(issue, ev)} />
                  <VerdictColumn assessment={assessment} />
                </div>
                <ScoreStrip parts={parts} />
              </div>
            );
          })}
          {sorted.length === 0 && (
            <div className="bg-white rounded-xl border border-stone-200 p-8 text-center text-sm text-slate-500">
              PRs collected, but no Linear issues found yet — run the collector against the TestRuh workspace.
            </div>
          )}
        </div>
      )}

      <HowItWorks />
    </main>
  );
}
