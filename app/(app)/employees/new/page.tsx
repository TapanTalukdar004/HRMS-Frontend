import Link from "next/link";
import { cookies } from "next/headers";
import { accountFor, AUTH_COOKIE } from "@/lib/auth";
import { getEmployeeForEdit } from "@/lib/queries";
import EmployeeForm from "../EmployeeForm";

/** Add (or edit, via ?id=) an employee — HR only. The static "new" segment wins over the dynamic [name]
 *  route, so /employees/new is the add page and /employees/new?id=<id> is the edit page. */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Add employee · HR Bot" };

export default async function NewEmployeePage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const acct = accountFor((await cookies()).get(AUTH_COOKIE)?.value);
  if (!acct || acct.role !== "hr") {
    return <main className="max-w-3xl mx-auto px-4 py-10"><div className="rounded-xl border border-stone-200 bg-white p-10 text-center text-slate-500">Adding or editing employees is available to HR only.</div></main>;
  }
  const { id } = await searchParams;
  const initial = id ? await getEmployeeForEdit(id) : null;

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
      <Link href="/employees" className="text-[13px] text-[#AE00D0] hover:underline">← Employees</Link>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mt-2 mb-6">
        {initial ? `Edit ${initial.name}` : "Add employee"}
      </h1>
      <EmployeeForm initial={initial} />
    </main>
  );
}
