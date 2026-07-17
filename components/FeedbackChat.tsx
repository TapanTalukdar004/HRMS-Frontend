"use client";

import { useEffect, useState } from "react";

type Msg = { role: string; content: string };

export function FeedbackChat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/feedback")
      .then((r) => r.json())
      .then((d) => { setMsgs(((d?.messages ?? []) as Msg[]).map((m) => ({ role: m.role, content: m.content }))); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setMsgs((m) => [...m, { role: "employee", content: text }]);
    setInput("");
    try {
      const r = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text }) });
      const d = await r.json();
      setMsgs((m) => [...m, { role: "ai", content: String(d?.reply ?? "(saved)") }]);
    } catch {
      setMsgs((m) => [...m, { role: "ai", content: "Network error — try again." }]);
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-6 rounded-xl border border-[#ede9fe] bg-white overflow-hidden">
      <div className="px-4 py-3 bg-[#faf7ff] border-b border-[#ede9fe]">
        <div className="text-[15px] font-semibold text-[#7B5AFF]">💬 Talk about your scores</div>
        <p className="text-[12px] text-slate-500 mt-0.5">Disagree with a score, or did part of the work in another repo? Explain here — it&apos;s saved to your report and the assistant replies.</p>
      </div>
      <div className="px-4 py-3 space-y-2 max-h-80 overflow-y-auto">
        {!loaded ? <p className="text-[13px] text-slate-400">Loading…</p>
          : msgs.length === 0 ? <p className="text-[13px] text-slate-400">No messages yet. Try &ldquo;why is my score low?&rdquo; or explain your work.</p>
          : msgs.map((m, i) => (
            <div key={i} className={m.role === "ai" ? "text-left" : "text-right"}>
              <span className={`inline-block rounded-2xl px-3 py-2 text-[13px] leading-snug max-w-[85%] whitespace-pre-wrap ${m.role === "ai" ? "bg-stone-100 text-slate-700" : "bg-[#7B5AFF] text-white"}`}>{m.content}</span>
            </div>
          ))}
        {busy && <p className="text-[12px] text-slate-400">assistant is thinking…</p>}
      </div>
      <form onSubmit={send} className="flex gap-2 p-3 border-t border-stone-100">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. AB-355 — I built the frontend in the web repo"
          className="flex-1 px-3 py-2 rounded-lg border border-stone-300 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#AE00D0]/30 focus:border-[#AE00D0]"
        />
        <button disabled={busy || !input.trim()} className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#AE00D0] to-[#7B5AFF] text-white text-[13px] font-medium disabled:opacity-50">Send</button>
      </form>
    </div>
  );
}
