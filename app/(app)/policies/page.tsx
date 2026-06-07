"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

// ─── Types ────────────────────────────────────────────────────────────────

type PolicyFile = {
  id: string;
  title: string;
  filename_original: string;
  storage_path: string;
  public_url: string;
  size_bytes: number | null;
  mime_type: string | null;
  category: string | null;
  description: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  updated_at: string;
};

function categoryTone(
  c: string | null,
): "brand" | "accent" | "emerald" | "amber" | "blue" | "rose" | "neutral" {
  switch ((c || "").toLowerCase()) {
    case "leave":
    case "benefits":
      return "emerald";
    case "compensation":
    case "travel & expenses":
      return "amber";
    case "conduct":
    case "equal opportunity":
      return "rose";
    case "hybrid / remote":
    case "work hours":
      return "blue";
    case "performance & reviews":
    case "process & forms":
      return "brand";
    case "it & security":
    case "tooling":
    case "asset management":
      return "accent";
    default:
      return "neutral";
  }
}

function humanBytes(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function humanDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function extLabel(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return "FILE";
  return filename.slice(dot + 1).toUpperCase().slice(0, 4);
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function PoliciesPage() {
  const [files, setFiles] = useState<PolicyFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/policies/files/list", {
        cache: "no-store",
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "load failed");
      setFiles(data.files as PolicyFile[]);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return files;
    return files.filter(
      (f) =>
        f.title.toLowerCase().includes(s) ||
        (f.category || "").toLowerCase().includes(s) ||
        (f.description || "").toLowerCase().includes(s),
    );
  }, [files, search]);

  return (
    <main className="p-6 sm:p-8">
      <div className="max-w-5xl mx-auto">
        <header className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
            HR Policies
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Company policy documents. Click any policy to open the document in
            a new tab.
          </p>
        </header>

        {error && (
          <div className="mb-4 rounded-lg bg-rose-50 ring-1 ring-rose-200 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* Search bar */}
        {!loading && files.length > 0 && (
          <div className="mb-4">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${files.length} polic${files.length === 1 ? "y" : "ies"}…`}
              className="w-full sm:max-w-sm rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#AE00D0]"
            />
          </div>
        )}

        {loading ? (
          <Card>
            <p className="text-sm text-slate-500">Loading policies…</p>
          </Card>
        ) : files.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-600">
              No policies available yet.
            </p>
          </Card>
        ) : (
          <Card flush>
            <div className="px-6 pt-6 pb-3">
              <CardHeader
                title="Active policies"
                description={`${filtered.length} of ${files.length} shown. Sorted by upload date (newest first).`}
                className="mb-0"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left border-y border-stone-200 bg-stone-50/60">
                  <tr>
                    <Th>Policy</Th>
                    <Th className="hidden md:table-cell">Category</Th>
                    <Th className="hidden lg:table-cell">Uploaded</Th>
                    <Th className="hidden sm:table-cell">Size</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((f) => (
                    <tr
                      key={f.id}
                      className="border-b border-stone-100 last:border-b-0 hover:bg-stone-50 transition"
                    >
                      <td className="py-3 px-6">
                        <a
                          href={f.public_url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="font-medium text-[#AE00D0] hover:underline inline-flex items-center gap-2"
                        >
                          <span className="text-[10px] font-bold text-stone-500 bg-stone-100 ring-1 ring-stone-200 px-1.5 py-0.5 rounded">
                            {extLabel(f.filename_original)}
                          </span>
                          {f.title}
                        </a>
                        {f.description && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            {f.description}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-6 hidden md:table-cell">
                        {f.category ? (
                          <Badge tone={categoryTone(f.category)}>
                            {f.category}
                          </Badge>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-6 text-xs text-slate-500 hidden lg:table-cell">
                        {humanDate(f.uploaded_at)}
                      </td>
                      <td className="py-3 px-6 text-xs text-slate-500 hidden sm:table-cell">
                        {humanBytes(f.size_bytes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <p className="px-6 py-8 text-center text-xs text-slate-500">
                  No matches for &ldquo;{search}&rdquo;.
                </p>
              )}
            </div>
          </Card>
        )}

        <BotKeysSection />
      </div>
    </main>
  );
}

// ─── Bot-keys section (read-only legacy hr_policies) ─────────────────────

type BotKey = {
  key: string;
  value: string;
  effective_from: string;
  notes: string | null;
};

function BotKeysSection() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<BotKey[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || loaded) return;
    fetch("/api/policies/bot-keys", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setRows(data.rows);
        else setError(data.error || "load failed");
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoaded(true));
  }, [open, loaded]);

  return (
    <div className="mt-10">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <span className="text-stone-400">{open ? "▼" : "▶"}</span>
        Bot quick-answer keys
        <span className="text-xs text-slate-400">
          (keys the Slack bot quotes for short policy questions like
          &ldquo;casual leave per year&rdquo;)
        </span>
      </button>

      {open && (
        <Card flush className="mt-3">
          <div className="px-6 pt-6 pb-2">
            <CardHeader
              title="hr_policies (key/value)"
              description="Used by the Slack bot when employees ask short factual policy questions."
              className="mb-0"
            />
          </div>
          {error && (
            <div className="px-6 py-3 text-xs text-rose-700">{error}</div>
          )}
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
                {rows.map((p) => (
                  <tr
                    key={p.key}
                    className="border-b border-stone-100 last:border-b-0 hover:bg-stone-50 transition"
                  >
                    <td className="py-3 px-6 font-mono text-xs text-[#AE00D0]">
                      {p.key}
                    </td>
                    <td className="py-3 px-6 font-medium text-slate-800">
                      {p.value}
                    </td>
                    <td className="py-3 px-6 text-slate-500 text-xs">
                      {p.effective_from}
                    </td>
                    <td className="py-3 px-6 text-slate-500 text-xs">
                      {p.notes ?? "—"}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && loaded && !error && (
                  <tr>
                    <td
                      colSpan={4}
                      className="py-6 px-6 text-center text-xs text-slate-500"
                    >
                      No quick-answer keys configured.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={
        "py-3 px-6 font-medium text-[11px] uppercase tracking-wider text-slate-500 text-left " +
        (className || "")
      }
    >
      {children}
    </th>
  );
}
