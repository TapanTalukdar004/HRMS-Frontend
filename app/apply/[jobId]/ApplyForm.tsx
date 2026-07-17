"use client";

import { useState } from "react";

/** Public application form. Posts multipart to /api/apply. Requires AI-screening consent.
 *  Standard candidate fields + any HR custom questions are packed into answers_json → candidates.form_answers. */
export function ApplyForm({ jobId, jobTitle, applyQuestions = [] }: { jobId: string; jobTitle: string; applyQuestions?: string[] }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("job_id", jobId);
    fd.set("consent", consent ? "true" : "false");
    // Pack the standard candidate fields + any HR custom answers into answers_json → form_answers jsonb.
    const g = (k: string) => String(fd.get(k) || "").trim();
    const answers = {
      total_experience: g("total_experience"),
      current_ctc: g("current_ctc"),
      expected_ctc: g("expected_ctc"),
      notice_period: g("notice_period"),
      current_location: g("current_location"),
      linkedin_url: g("linkedin_url"),
      portfolio_url: g("portfolio_url"),
      relocate: g("relocate"),
      earliest_start: g("earliest_start"),
      custom: applyQuestions.map((qq, i) => ({ q: qq, a: g(`custom_${i}`) })).filter((x) => x.a),
    };
    fd.set("answers_json", JSON.stringify(answers));
    setBusy(true);
    try {
      const res = await fetch("/api/apply", { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) setDone(true);
      else setError(body.error || "Something went wrong. Please try again.");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-5 text-center">
        <div className="text-emerald-700 font-semibold">Application received ✓</div>
        <p className="mt-1 text-[13px] text-emerald-800/80">
          Thanks for applying to <b>{jobTitle}</b>. Our team will review your resume and be in touch.
        </p>
      </div>
    );
  }

  const label = "block text-xs font-medium text-slate-600 mb-1.5";
  const input =
    "w-full px-3 py-2.5 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#AE00D0]/30 focus:border-[#AE00D0]";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className={label} htmlFor="name">Full name *</label>
        <input id="name" name="name" required className={input} placeholder="Your name" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={label} htmlFor="email">Email *</label>
          <input id="email" name="email" type="email" required className={input} placeholder="you@email.com" />
        </div>
        <div>
          <label className={label} htmlFor="phone">Phone</label>
          <input id="phone" name="phone" className={input} placeholder="Optional" />
        </div>
      </div>
      <div>
        <label className={label} htmlFor="resume">Resume (PDF / DOC / DOCX) *</label>
        <input id="resume" name="resume" type="file" required accept=".pdf,.doc,.docx,.txt,.rtf"
          className="w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#fdf0ff] file:px-3 file:py-2 file:text-[#AE00D0] file:font-medium" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={label} htmlFor="total_experience">Total experience (years)</label>
          <input id="total_experience" name="total_experience" type="number" min={0} step="0.5" className={input} placeholder="e.g. 3" />
        </div>
        <div>
          <label className={label} htmlFor="current_location">Current location</label>
          <input id="current_location" name="current_location" className={input} placeholder="City, Country" />
        </div>
        <div>
          <label className={label} htmlFor="current_ctc">Current CTC (annual)</label>
          <input id="current_ctc" name="current_ctc" className={input} placeholder="Optional" />
        </div>
        <div>
          <label className={label} htmlFor="expected_ctc">Expected CTC (annual)</label>
          <input id="expected_ctc" name="expected_ctc" className={input} placeholder="Optional" />
        </div>
        <div>
          <label className={label} htmlFor="notice_period">Notice period</label>
          <select id="notice_period" name="notice_period" className={input} defaultValue="">
            <option value="">Select…</option>
            <option>Immediate</option>
            <option>15 days</option>
            <option>1 month</option>
            <option>2 months</option>
            <option>3 months</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor="earliest_start">Earliest start date</label>
          <input id="earliest_start" name="earliest_start" type="date" className={input} />
        </div>
        <div>
          <label className={label} htmlFor="linkedin_url">LinkedIn URL</label>
          <input id="linkedin_url" name="linkedin_url" type="url" className={input} placeholder="https://linkedin.com/in/…" />
        </div>
        <div>
          <label className={label} htmlFor="portfolio_url">Portfolio / GitHub URL</label>
          <input id="portfolio_url" name="portfolio_url" type="url" className={input} placeholder="https://…" />
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="relocate">Willing to relocate?</label>
          <select id="relocate" name="relocate" className={input} defaultValue="">
            <option value="">Select…</option>
            <option>Yes</option>
            <option>No</option>
            <option>Open to discuss</option>
          </select>
        </div>
      </div>

      {applyQuestions.length > 0 && (
        <div className="space-y-3 border-t border-stone-100 pt-3">
          <div className="text-[12px] font-medium text-slate-600">A few questions from the hiring team</div>
          {applyQuestions.map((qq, i) => (
            <div key={i}>
              <label className={label} htmlFor={`custom_${i}`}>{qq}</label>
              <textarea id={`custom_${i}`} name={`custom_${i}`} rows={2} className={input} />
            </div>
          ))}
        </div>
      )}

      <label className="flex items-start gap-2 text-[12.5px] text-slate-600">
        <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
        <span>
          I consent to my resume and application being screened with AI assistance, and to a later
          interview being recorded for evaluation. A human makes the final hiring decision.
        </span>
      </label>

      {error && (
        <div className="text-[13px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>
      )}

      <button type="submit" disabled={busy || !consent}
        className="w-full py-2.5 rounded-lg bg-gradient-to-r from-[#AE00D0] to-[#7B5AFF] text-white text-sm font-medium disabled:opacity-50 transition-opacity">
        {busy ? "Submitting…" : "Submit application"}
      </button>
    </form>
  );
}
