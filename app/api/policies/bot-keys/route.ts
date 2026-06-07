import { NextResponse } from "next/server";
import { q } from "@/lib/db";

/**
 * GET /api/policies/bot-keys
 * Read-only list of legacy hr_policies (the flat key/value rows the
 * Slack bot quotes when employees ask short policy questions).
 *
 * Edit/write paths intentionally NOT exposed yet — those wait for
 * role-based auth so we don't let any authenticated user mutate the
 * data Esha/the bot relies on.
 */
export const dynamic = "force-dynamic";

type BotKeyRow = {
  key: string;
  value: string;
  effective_from: string;
  notes: string | null;
};

export async function GET() {
  try {
    const rows = await q<BotKeyRow>(
      `SELECT key, value, effective_from::text AS effective_from, notes
       FROM hr_policies ORDER BY key`,
    );
    return NextResponse.json({ ok: true, rows });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e) },
      { status: 500 },
    );
  }
}
