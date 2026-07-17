import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { q } from "@/lib/db";
import { accountFor, AUTH_COOKIE } from "@/lib/auth";
import { getEmployeeReports } from "@/lib/realReport";

export const dynamic = "force-dynamic";

type Msg = { role: string; content: string; created_at: string; issue_key: string | null };

async function thread(employee: string): Promise<Msg[]> {
  return q<Msg>(
    `SELECT role, content, created_at, issue_key FROM employee_feedback
     WHERE employee = $1 ORDER BY created_at ASC LIMIT 100`, [employee]);
}

/**
 * Ask the local Claude CLI (the same headless invocation the analysis agent uses:
 * `claude -p --output-format json`, prompt on stdin). This relies on the machine's
 * logged-in Claude session — no ANTHROPIC_API_KEY needed. Returns null on any
 * failure so the caller can fall back gracefully.
 */
/** Candidate paths/names for the claude binary. The absolute path is tried first
 *  because the dev server's PATH may be unix-style (Git Bash) and unresolvable by
 *  a Windows shell. Falls back to bare names for other setups. */
function claudeCandidates(): string[] {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  if (process.platform === "win32") {
    return [home && path.join(home, ".local", "bin", "claude.exe"), "claude.exe", "claude"].filter(Boolean) as string[];
  }
  return [home && path.join(home, ".local", "bin", "claude"), "claude"].filter(Boolean) as string[];
}

type RunResult = { text: string | null; spawnFailed: boolean };

function runOne(cmd: string, prompt: string, timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve) => {
    let child;
    try { child = spawn(cmd, ["-p", "--output-format", "json"], { shell: false }); }
    catch { resolve({ text: null, spawnFailed: true }); return; }
    let out = "", failed = false;
    const timer = setTimeout(() => { try { child.kill(); } catch { /* */ } resolve({ text: null, spawnFailed: false }); }, timeoutMs);
    child.on("error", () => { failed = true; clearTimeout(timer); resolve({ text: null, spawnFailed: true }); });
    child.stdout.on("data", (d) => { out += d.toString(); });
    child.on("close", (code) => {
      if (failed) return;
      clearTimeout(timer);
      if (code !== 0) { resolve({ text: null, spawnFailed: false }); return; }
      try {
        const env = JSON.parse(out) as { result?: string };
        const txt = typeof env.result === "string" ? env.result.trim() : "";
        resolve({ text: txt || null, spawnFailed: false });
      } catch { resolve({ text: null, spawnFailed: false }); }
    });
    try { child.stdin.write(prompt); child.stdin.end(); } catch { clearTimeout(timer); resolve({ text: null, spawnFailed: true }); }
  });
}

/** Run the local Claude CLI headless (`claude -p --output-format json`, prompt on
 *  stdin) — same mechanism the analysis agent uses, so it relies on the machine's
 *  logged-in Claude session and needs no ANTHROPIC_API_KEY. Tries each candidate
 *  binary; returns null on total failure so the caller falls back gracefully. */
async function askClaude(prompt: string, timeoutMs = 90_000): Promise<string | null> {
  for (const cmd of claudeCandidates()) {
    const r = await runOne(cmd, prompt, timeoutMs);
    if (!r.spawnFailed) return r.text;   // it actually ran — don't try other binaries
  }
  return null;
}

export async function GET() {
  const c = await cookies();
  const acct = accountFor(c.get(AUTH_COOKIE)?.value);
  if (!acct || acct.role !== "employee" || !acct.employee) return NextResponse.json({ messages: [] });
  return NextResponse.json({ messages: await thread(acct.employee) });
}

export async function POST(req: Request) {
  const c = await cookies();
  const acct = accountFor(c.get(AUTH_COOKIE)?.value);
  if (!acct || acct.role !== "employee" || !acct.employee) {
    return NextResponse.json({ error: "only employees can post here" }, { status: 403 });
  }
  const employee = acct.employee;
  let message = "", issue_key: string | null = null;
  try { const b = await req.json(); message = String(b?.message ?? "").trim(); issue_key = b?.issue_key ? String(b.issue_key) : null; } catch { /* */ }
  if (!message) return NextResponse.json({ error: "empty message" }, { status: 400 });

  await q(`INSERT INTO employee_feedback (id, employee, issue_key, role, content) VALUES ($1,$2,$3,'employee',$4)`,
    [randomUUID(), employee, issue_key, message]);

  let reply = "Thanks — your note is saved and HR can see it. (The assistant is busy right now; it'll pick this up shortly.)";
  try {
    const reports = await getEmployeeReports();
    const me = reports.find((r) => r.employee === employee);
    const ctx = me && me.provenIssues.length
      ? me.provenIssues.map((s) => `${s.issue.issue_key} "${s.issue.title}" · status ${s.issue.status} · ${s.points ?? "—"} pts · quality ${s.quality ?? "—"}/10${s.together ? " · together=" + s.together : ""}`).join("\n")
      : "no scored work linked in this repo yet (their PRs may be untracked or in another repo).";
    const counts = me ? `merged linked PRs: ${me.mergedPrs}, total PRs authored: ${me.counts.prs}, linked: ${me.counts.linked}` : "";
    const prior = (await thread(employee)).slice(-12);
    const convo = prior.map((m) => `${m.role === "ai" ? "Assistant" : "Engineer"}: ${m.content}`).join("\n");
    const prompt = `You are the HR-Bot performance assistant talking to engineer "${employee}" about THEIR OWN scores in the ruh-agent-gateway repo (read-only). Be warm, plain, honest; 2–4 short sentences; no jargon. You MAY: explain why a score is what it is; acknowledge if they say work is in another repo (reassure it'll be re-scored once that repo is connected — it is NOT held against them); ask for specifics if vague; name a real defect honestly if their data shows one. You do NOT change scores — you record their context for HR and the next analysis run.

Their data:
${counts}
${ctx}

Conversation so far:
${convo}

Write the Assistant's next reply now. Output ONLY the reply text — no preamble, no quotes, no markdown headers.`;
    const ai = await askClaude(prompt);
    if (ai) reply = ai;
  } catch { /* keep the graceful fallback */ }

  await q(`INSERT INTO employee_feedback (id, employee, issue_key, role, content) VALUES ($1,$2,$3,'ai',$4)`,
    [randomUUID(), employee, issue_key, reply]);
  return NextResponse.json({ reply });
}
