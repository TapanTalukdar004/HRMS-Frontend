import { NextResponse } from "next/server";

/**
 * POST /api/policies/extract
 * Proxies a multipart PDF upload to the FastAPI skills server, which runs
 * pypdf + Groq and returns the structured draft policies.  Nothing is
 * persisted here — the UI shows the drafts in a preview modal and the
 * user accepts/edits/discards each before posting to /api/policies/save.
 *
 * Env:
 *   NEXT_PUBLIC_SKILLS_API_BASE  (also read server-side; default
 *                                http://127.0.0.1:8088)
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cap proxy upload size — must be <= the FastAPI MAX_POLICY_PDF_BYTES.
const MAX_BYTES = 12 * 1024 * 1024;

function skillsApiBase(): string {
  return (
    process.env.SKILLS_API_BASE ||
    process.env.NEXT_PUBLIC_SKILLS_API_BASE ||
    "http://127.0.0.1:8088"
  ).replace(/\/+$/, "");
}

export async function POST(req: Request) {
  let incoming: FormData;
  try {
    incoming = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "expected multipart/form-data" },
      { status: 400 },
    );
  }

  const file = incoming.get("pdf");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "missing 'pdf' file field" },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json(
      { ok: false, error: "empty file" },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error: `PDF too large (${file.size.toLocaleString()} bytes; limit ${MAX_BYTES.toLocaleString()})`,
      },
      { status: 413 },
    );
  }
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json(
      { ok: false, error: "filename must end in .pdf" },
      { status: 400 },
    );
  }

  // Re-pack into a fresh FormData for the upstream call.
  const upstream = new FormData();
  upstream.append("pdf", file, file.name);

  const url = `${skillsApiBase()}/api/policies/extract`;
  try {
    const res = await fetch(url, {
      method: "POST",
      body: upstream,
      // 90s — LLM call can take 30-60s on a long PDF
      signal: AbortSignal.timeout(90_000),
    });
    const text = await res.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: `skills-api returned non-JSON (${res.status})`,
          body: text.slice(0, 400),
        },
        { status: 502 },
      );
    }
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `skills-api ${res.status}`, upstream: payload },
        { status: 502 },
      );
    }
    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "could not reach skills API at " +
          url +
          " — is the FastAPI server running? (" +
          String(e) +
          ")",
      },
      { status: 503 },
    );
  }
}
