import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { q } from "./db";

/** Shared helpers for invoking the repo's Python skills/agents from Next route handlers (server-side).
 *  Locates the repo root + the venv python robustly (the dev server may run from repo root or frontend/).
 *
 *  On Vercel there is no local venv / Claude CLI, so repoRoot() returns null there. Callers should fall
 *  back to enqueueScreeningRequest() in that case — perf_tracker/screening_worker.py (scheduled every
 *  minute on the owner's machine) polls screening_requests and runs the real screener locally. */

export function repoRoot(): string | null {
  const marker = path.join("skills", "jd-pdf-generator", "scripts", "generate_jd_pdf.py");
  for (const c of [process.cwd(), path.join(process.cwd(), ".."), path.join(process.cwd(), "..", "..")]) {
    if (existsSync(path.join(c, marker))) return path.resolve(c);
  }
  return null;
}

export function pythonPath(root: string): string {
  const win = path.join(root, ".venv", "Scripts", "python.exe");
  const nix = path.join(root, ".venv", "bin", "python");
  if (existsSync(win)) return win;
  if (existsSync(nix)) return nix;
  return process.platform === "win32" ? "python" : "python3";
}

/** Fire-and-forget `python <args...>` in `root` — detached + unref so it outlives the request and never
 *  blocks the response (used for auto-screen-on-apply and the "Screen all" batch). Returns true if spawned. */
export function spawnPythonDetached(args: string[], root: string): boolean {
  try {
    const child = spawn(pythonPath(root), args, { cwd: root, detached: true, stdio: "ignore" });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/** Run `python <args...>` in `root`, capturing stderr. Never rejects; returns the exit code. */
export function runPython(args: string[], root: string, timeoutMs = 60_000): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    let child;
    try { child = spawn(pythonPath(root), args, { cwd: root, shell: false }); }
    catch (e) { resolve({ code: -1, stderr: String(e) }); return; }
    let stderr = "";
    const timer = setTimeout(() => { try { child.kill(); } catch { /* */ } resolve({ code: -2, stderr: "timeout" }); }, timeoutMs);
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", (e) => { clearTimeout(timer); resolve({ code: -1, stderr: String(e) }); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code: code ?? -1, stderr }); });
  });
}

/** No local venv (Vercel): queue the screening for the local poller instead of spawning it here.
 *  `candidateId` null = screen the whole job (the "Screen all" button); set = one applicant
 *  (auto-screen-on-apply). Returns true if the row was queued. */
export async function enqueueScreeningRequest(jobId: string, candidateId: string | null, requestedBy: string): Promise<boolean> {
  try {
    await q(
      `INSERT INTO screening_requests (job_post_id, candidate_id, requested_by) VALUES ($1, $2, $3)`,
      [jobId, candidateId, requestedBy],
    );
    return true;
  } catch {
    return false;
  }
}
