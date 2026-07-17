import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { q } from "@/lib/db";
import { JD_COLUMNS, jdPayload, type JobJDRow } from "@/lib/jdData";
import { repoRoot, runPython } from "@/lib/pyRun";

/**
 * GET /api/jobs/[jobId]/jd — stream the RUH-branded JD as a PDF, generated on demand by the existing
 * skill (skills/jd-pdf-generator/scripts/generate_jd_pdf.py, WeasyPrint). Public for PUBLISHED jobs
 * only (the apply page is public). Maps the job_posts row into the skill's JSON via lib/jdData so the
 * PDF matches the on-page BrandedJD.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slug(title: string): string {
  return (title || "job").toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").slice(0, 60) || "job";
}

export async function GET(_req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;

  let job: (JobJDRow & { is_published: boolean }) | undefined;
  try {
    job = (await q<JobJDRow & { is_published: boolean }>(
      `SELECT ${JD_COLUMNS}, is_published FROM job_posts WHERE id = $1`, [jobId],
    ))[0];
  } catch { return NextResponse.json({ ok: false, error: "invalid job id" }, { status: 400 }); }
  if (!job || !job.is_published) return NextResponse.json({ ok: false, error: "job not found" }, { status: 404 });

  const root = repoRoot();
  if (!root) return NextResponse.json({ ok: false, error: "JD skill not found on server" }, { status: 500 });

  const tmp = os.tmpdir();
  const stem = `jd-${randomUUID()}`;
  const jsonPath = path.join(tmp, `${stem}.json`);
  const pdfPath = path.join(tmp, `${stem}.pdf`);
  const script = path.join(root, "skills", "jd-pdf-generator", "scripts", "generate_jd_pdf.py");

  try {
    await fs.writeFile(jsonPath, JSON.stringify(jdPayload(job)), "utf-8");
    const { code, stderr } = await runPython([script, "--data", jsonPath, "--output", pdfPath], root);
    if (code !== 0 || !existsSync(pdfPath)) {
      return NextResponse.json({ ok: false, error: `JD PDF generation failed: ${stderr.slice(0, 300)}` }, { status: 502 });
    }
    const buf = await fs.readFile(pdfPath);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="job-description-${slug(job.title)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  } finally {
    fs.unlink(jsonPath).catch(() => {});
    fs.unlink(pdfPath).catch(() => {});
    fs.unlink(pdfPath.replace(".pdf", ".html")).catch(() => {}); // the skill also writes a debug .html
  }
}
