"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader } from "./ui/Card";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { clsx } from "@/lib/cn";
import type { EmployeeProfileFull } from "@/lib/queries";
import { saveEmployeeProfile } from "@/app/(app)/employees/[id]/actions";

type Props = { profile: EmployeeProfileFull };

/**
 * Editable employee profile card. View mode by default; HR clicks "Edit"
 * to flip to a form. Submitting the form calls a Server Action that writes
 * to `employees` + `employee_profiles` and revalidates the page.
 *
 * NO AUTH GATE TODAY — see project memory `project_hr_bot_auth_deferred`.
 * This card and its Server Action will be wrapped in an HR role check
 * before any production build.
 */
export function EmployeeProfileCard({ profile }: Props) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Empty fields are surfaced so HR can spot what's missing at a glance.
  const missing = [
    !profile.emp_id && "Employee ID",
    !profile.department && "Department",
    !profile.designation && "Designation",
    !profile.joining_date && "Joining date",
  ].filter(Boolean) as string[];

  function onSubmit(form: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await saveEmployeeProfile(profile.id, form);
      if (result.ok) {
        setEditing(false);
      } else {
        setError(result.error);
      }
    });
  }

  if (!editing) {
    return (
      <Card>
        <CardHeader
          title="Profile"
          description="Read by the bot for letters, by the dashboard for sorting and search."
          right={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
          }
        />

        {missing.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-amber-700">
            <Badge tone="amber">Missing</Badge>
            <span className="text-slate-600">
              {missing.join(" · ")}
            </span>
          </div>
        )}

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Row label="Full name"     value={profile.name} />
          <Row label="First name"    value={profile.first_name} />
          <Row label="Email"         value={profile.email} mono />
          <Row label="Slack ID"      value={profile.slack_user_id} mono dim />
          <Row label="Employee ID"   value={profile.emp_id} mono />
          <Row label="Department"    value={profile.department} />
          <Row label="Designation"   value={profile.designation} />
          <Row label="Role (legacy)" value={profile.role} dim />
          <Row label="Joining date"  value={profile.joining_date} mono />
          <Row label="Date of birth" value={profile.date_of_birth} mono />
          <Row label="Location"      value={profile.location} />
          <Row label="Pronoun"       value={profile.pronoun} />
        </dl>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Edit profile"
        description="Updates write to employees + employee_profiles tables. HR-only (auth gate pending)."
      />

      <form action={onSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full name" name="name" defaultValue={profile.name} required />
          <Field label="First name" name="first_name" defaultValue={profile.first_name} required />
          <Field label="Email" name="email" type="email" defaultValue={profile.email ?? ""} />
          <Field label="Role (legacy)" name="role" defaultValue={profile.role ?? ""} hint="Free-text title shown to the bot. Designation below is the structured field." />
          <Field label="Employee ID" name="emp_id" defaultValue={profile.emp_id ?? ""} hint="e.g. RUH-DEMO-005" mono />
          <Field label="Department" name="department" defaultValue={profile.department ?? ""} hint="Engineering / Design / Product / Sales / People Ops / ..." />
          <Field label="Designation" name="designation" defaultValue={profile.designation ?? ""} hint="The formal job title (used in promotion / experience letters)" />
          <Field label="Joining date" name="joining_date" type="date" defaultValue={profile.joining_date ?? ""} mono />
          <Field label="Date of birth" name="date_of_birth" type="date" defaultValue={profile.date_of_birth ?? ""} mono />
          <Field label="Location" name="location" defaultValue={profile.location ?? ""} hint="City or office" />
          <PronounField defaultValue={profile.pronoun ?? ""} />
        </div>

        {error && (
          <div className="rounded-lg bg-rose-50 ring-1 ring-rose-200 px-4 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-200">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditing(false);
              setError(null);
            }}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Read-mode row
// ─────────────────────────────────────────────────────────────────────
function Row({
  label,
  value,
  mono,
  dim,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  dim?: boolean;
}) {
  const empty = !value;
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
        {label}
      </dt>
      <dd
        className={clsx(
          "text-sm",
          empty
            ? "text-slate-300 italic"
            : dim
            ? "text-slate-500"
            : "text-slate-900",
          mono && !empty && "font-mono text-xs",
        )}
      >
        {empty ? "—" : value}
      </dd>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Edit-mode field
// ─────────────────────────────────────────────────────────────────────
function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required,
  hint,
  mono,
}: {
  label: string;
  name: string;
  defaultValue: string;
  type?: string;
  required?: boolean;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wider text-slate-500 font-medium mb-1">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        className={clsx(
          "w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm",
          "text-slate-900 placeholder:text-slate-400",
          "focus:outline-none focus:ring-2 focus:ring-[#AE00D0] focus:border-[#AE00D0]",
          "hover:border-stone-300 transition shadow-sm",
          mono && "font-mono text-xs",
        )}
      />
      {hint && (
        <span className="block text-[11px] text-slate-400 mt-1">{hint}</span>
      )}
    </label>
  );
}

function PronounField({ defaultValue }: { defaultValue: string }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wider text-slate-500 font-medium mb-1">
        Pronoun
      </span>
      <select
        name="pronoun"
        defaultValue={defaultValue}
        className={clsx(
          "w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm",
          "text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#AE00D0]",
          "focus:border-[#AE00D0] hover:border-stone-300 transition shadow-sm cursor-pointer",
        )}
      >
        <option value="">— not set —</option>
        <option value="he">he</option>
        <option value="she">she</option>
        <option value="they">they</option>
      </select>
      <span className="block text-[11px] text-slate-400 mt-1">
        Used by promotion / experience letter templates.
      </span>
    </label>
  );
}
