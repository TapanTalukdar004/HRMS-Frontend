import { q } from "@/lib/db";
import { ComingSoonPage } from "@/components/ComingSoonPage";
import { Card, CardHeader } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

type Policy = {
  key: string;
  value: string;
  effective_from: string;
  notes: string | null;
};

export default async function PoliciesPage() {
  let policies: Policy[] = [];
  let dbError: string | null = null;
  try {
    policies = await q<Policy>(
      `SELECT key, value, effective_from::text AS effective_from, notes
       FROM hr_policies ORDER BY key`,
    );
  } catch (e) {
    dbError = String(e);
  }

  if (dbError || policies.length === 0) {
    return (
      <ComingSoonPage
        title="HR Policies"
        emoji="⚙️"
        description="Read-only view of company HR policies that the Slack bot quotes when employees ask. Editing comes after auth lands."
        whatItWillShow={[
          "All hr_policies rows: key (e.g., notice_period_months), value, effective date, notes",
          "Read-only for now (the bot already reads from this table to answer policy questions)",
          "Future: HR-only edit form to update policies + auto-versioning",
          dbError
            ? `(DB error: ${dbError.slice(0, 100)})`
            : "(table is empty — run seed_hr_policies SQL)",
        ]}
        prerequisites={[
          "hr_policies table (exists, change 013)",
          "Seed data: sql/002_seed_hr_policies.sql (already applied)",
          "Auth + role-based edit gate before letting users modify policies",
        ]}
      />
    );
  }

  return (
    <main className="p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
            HR Policies
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {policies.length} active · quoted by the bot when answering employee policy
            questions. Read-only for now.
          </p>
        </header>

        <Card flush>
          <div className="px-6 pt-6 pb-4">
            <CardHeader
              title="Active policies"
              description="Effective dates are sourced from the hr_policies table"
              className="mb-0"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left border-y border-stone-200 bg-stone-50/60">
                <tr>
                  <Th>Key</Th>
                  <Th>Value</Th>
                  <Th>Effective from</Th>
                  <Th>Notes</Th>
                </tr>
              </thead>
              <tbody>
                {policies.map((p) => (
                  <tr
                    key={p.key}
                    className="border-b border-stone-100 last:border-b-0 hover:bg-stone-50 transition"
                  >
                    <td className="py-3 px-6 font-mono text-xs text-[#AE00D0]">
                      {p.key}
                    </td>
                    <td className="py-3 px-6 font-medium text-slate-800">{p.value}</td>
                    <td className="py-3 px-6 text-slate-500 text-xs">
                      {p.effective_from}
                    </td>
                    <td className="py-3 px-6 text-slate-500 text-xs">
                      {p.notes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </main>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="py-3 px-6 font-medium text-[11px] uppercase tracking-wider text-slate-500 text-left">
      {children}
    </th>
  );
}
