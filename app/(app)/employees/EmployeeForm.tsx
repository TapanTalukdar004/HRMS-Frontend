"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/** HR add/edit employee form (Phase 1 — the identity hub). Captures the person's details plus their
 *  Linear email + GitHub login, which the analyzer later resolves PRs/issues through. Advisory pipeline —
 *  entering an employee produces no score; scoring starts only when the analyzer is activated. */
type Initial = {
  employee_id: string; name: string; email: string | null; role: string | null; manager_email: string | null;
  is_active: boolean; emp_id: string | null; designation: string | null; department: string | null;
  joining_date: string | null; location: string | null; pronoun: string | null;
  github_login: string | null; linear_email: string | null; linear_user_id: string | null;
} | null;

const lbl = "block text-[12px] font-medium text-slate-600 mb-1";
const inp = "w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#AE00D0]/30 focus:border-[#AE00D0]";

// Module-level (stable) so inputs keep focus across re-renders.
function TextField({ label, value, onChange, type = "text", ph = "" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; ph?: string;
}) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      <input type={type} className={inp} value={value} placeholder={ph} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export default function EmployeeForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const editing = !!initial;
  const [f, setF] = useState({
    name: initial?.name ?? "", email: initial?.email ?? "", role: initial?.role ?? "",
    manager_email: initial?.manager_email ?? "", emp_id: initial?.emp_id ?? "",
    designation: initial?.designation ?? "", department: initial?.department ?? "",
    joining_date: initial?.joining_date ? initial.joining_date.slice(0, 10) : "", location: initial?.location ?? "",
    pronoun: initial?.pronoun ?? "", github_login: initial?.github_login ?? "", linear_email: initial?.linear_email ?? "",
    linear_user_id: initial?.linear_user_id ?? "", is_active: initial?.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    if (!f.name.trim()) { setErr("Name is required."); return; }
    setBusy(true);
    try {
      const url = editing ? `/api/employees/${initial!.employee_id}` : "/api/employees";
      const res = await fetch(url, { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error || "could not save"); setBusy(false); return; }
      router.push("/employees"); router.refresh();
    } catch { setErr("network error"); setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="bg-white rounded-xl border border-stone-200 p-5">
        <h2 className="text-[13px] font-semibold text-slate-800 mb-3">Person</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className={lbl}>Full name *</label><input className={inp} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Aarav Sharma" required /></div>
          <TextField label="Email" type="email" ph="name@ruh.ai" value={f.email} onChange={(v) => set("email", v)} />
          <TextField label="Employee ID" ph="RUH-0042" value={f.emp_id} onChange={(v) => set("emp_id", v)} />
          <TextField label="Designation" ph="Backend Engineer" value={f.designation} onChange={(v) => set("designation", v)} />
          <TextField label="Department" ph="Engineering" value={f.department} onChange={(v) => set("department", v)} />
          <TextField label="Joining date" type="date" value={f.joining_date} onChange={(v) => set("joining_date", v)} />
          <TextField label="Location" ph="Remote" value={f.location} onChange={(v) => set("location", v)} />
          <TextField label="Pronoun" ph="they/them" value={f.pronoun} onChange={(v) => set("pronoun", v)} />
          <TextField label="Role" ph="employee" value={f.role} onChange={(v) => set("role", v)} />
          <TextField label="Manager email" type="email" ph="manager@ruh.ai" value={f.manager_email} onChange={(v) => set("manager_email", v)} />
        </div>
        <label className="flex items-center gap-2 mt-4 text-[12.5px] text-slate-600">
          <input type="checkbox" checked={f.is_active} onChange={(e) => set("is_active", e.target.checked)} /> Active
        </label>
      </section>

      <section className="bg-white rounded-xl border border-stone-200 p-5">
        <h2 className="text-[13px] font-semibold text-slate-800 mb-1">Integrations <span className="text-[11px] font-normal text-slate-400">— the identity hub</span></h2>
        <p className="text-[12px] text-slate-500 mb-3">Their Linear email + GitHub login are how the analyzer will match this person&apos;s issues and PRs once you connect access. Optional now; needed before scoring.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField label="GitHub login" ph="aarav-s" value={f.github_login} onChange={(v) => set("github_login", v)} />
          <TextField label="Linear email" type="email" ph="aarav@ruh.ai" value={f.linear_email} onChange={(v) => set("linear_email", v)} />
          <TextField label="Linear user id (optional)" ph="resolved on first sync" value={f.linear_user_id} onChange={(v) => set("linear_user_id", v)} />
        </div>
      </section>

      {err && <div className="text-[13px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{err}</div>}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg bg-[#AE00D0] text-white text-sm font-medium hover:bg-[#9100ad] disabled:opacity-50">
          {busy ? "Saving…" : editing ? "Save changes" : "Add employee"}
        </button>
        <Link href="/employees" className="px-4 py-2 rounded-lg border border-stone-300 text-sm text-slate-600 hover:bg-stone-50">Cancel</Link>
        <span className="text-[11px] text-slate-400">Advisory pipeline — adding an employee produces no score.</span>
      </div>
    </form>
  );
}
