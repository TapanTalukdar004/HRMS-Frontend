"use client";

import { useState } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_SKILLS_API_BASE ?? "http://localhost:8088";

const INPUT_CLASS =
  "w-full px-3 py-2.5 rounded-lg border border-stone-300 text-sm text-slate-900 " +
  "bg-white focus:outline-none focus:border-[#AE00D0] focus:ring-2 focus:ring-[#AE00D0]/15 transition";

type GenResult = {
  ok: boolean;
  filename?: string;
  download_url?: string;
  error?: string;
};

export function JDGenerator() {
  const [title, setTitle] = useState("Senior Backend Developer");
  const [minExperience, setMinExperience] = useState("5+");
  const [shift, setShift] = useState("10am-6pm IST");
  const [workMode, setWorkMode] = useState("hybrid");
  const [skills, setSkills] = useState("Python, FastAPI, Postgres, Docker");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<GenResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    setResult(null);
    try {
      const resp = await fetch(`${API_BASE}/api/skills/jd/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, minExperience, shift, workMode, skills }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        setErrorMsg(data.detail ?? data.error ?? `Failed (${resp.status})`);
      } else {
        setResult(data as GenResult);
      }
    } catch (err) {
      setErrorMsg(
        (err as Error).message +
          " — is the API server running? Try `python -m perf_tracker serve-api`",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const pdfUrl = result?.download_url ? `${API_BASE}${result.download_url}` : null;

  return (
    <main className="max-w-6xl mx-auto px-8 py-10">
      <Link href="/" className="text-sm text-slate-500 hover:text-[#AE00D0]">
        ← Home
      </Link>

      <header className="mt-4 mb-8 flex items-start gap-5">
        <div className="text-5xl leading-none">📄</div>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Job Description Generator
          </h1>
          <p className="mt-2 text-slate-600 leading-relaxed">
            Fill in the role details. The bot calls Claude to draft the content
            and WeasyPrint to typeset a RUH AI-branded PDF. Download or preview
            inline. Same generator the Slack bot uses.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <form
          onSubmit={onSubmit}
          className="bg-white rounded-xl border border-stone-200 p-6 space-y-4"
        >
          <Field label="Role title">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Minimum years of experience">
            <input
              type="text"
              value={minExperience}
              onChange={(e) => setMinExperience(e.target.value)}
              placeholder="5+, 2+, 0-2"
              required
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Shift / hours">
            <input
              type="text"
              value={shift}
              onChange={(e) => setShift(e.target.value)}
              placeholder="10am-6pm IST"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Work mode">
            <select
              value={workMode}
              onChange={(e) => setWorkMode(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="on-site">On-site</option>
            </select>
          </Field>
          <Field label="Required skills (comma-separated)">
            <textarea
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              rows={3}
              required
              className={INPUT_CLASS}
            />
          </Field>

          <button
            type="submit"
            disabled={submitting}
            className="w-full px-4 py-3 rounded-lg bg-[#AE00D0] text-white font-medium
                       hover:bg-[#9100ad] disabled:opacity-50 disabled:cursor-not-allowed
                       transition shadow-sm"
          >
            {submitting ? "Generating… (this takes ~30 seconds)" : "Generate JD PDF"}
          </button>

          {errorMsg && (
            <div className="text-sm bg-rose-50 text-rose-800 border border-rose-200 rounded-lg p-3">
              ⚠️ {errorMsg}
            </div>
          )}
        </form>

        {/* Preview */}
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          {!result ? (
            <div className="h-full min-h-[500px] flex items-center justify-center text-slate-400 p-10 text-center">
              <div>
                <div className="text-5xl mb-3">📋</div>
                <div className="text-sm">Fill the form and hit Generate.</div>
                <div className="text-xs mt-2 text-slate-300">
                  Preview will appear here.
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col">
              <div className="px-5 py-3 border-b border-stone-200 flex items-center justify-between">
                <div className="text-sm font-medium text-slate-900 truncate">
                  {result.filename}
                </div>
                <a
                  href={pdfUrl!}
                  download={result.filename}
                  className="text-sm text-[#AE00D0] hover:text-[#9100ad] font-medium"
                >
                  ⬇ Download
                </a>
              </div>
              <iframe
                src={pdfUrl!}
                title="JD PDF preview"
                className="flex-1 w-full min-h-[700px]"
              />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
        {label}
      </div>
      {children}
    </label>
  );
}
