"use client";

import { useEffect, useRef, useState } from "react";

/** Consent-gated, audio-only interview recorder (Phase 4a). Records in the browser (free), streams
 *  10s chunks, assembles one Blob and uploads it to the private 'interviews' bucket via the recording
 *  route. A live Web-Speech caption is shown as a DRAFT AID only — never the scored transcript (that's
 *  faster-whisper in 4b). getUserMedia is hard-blocked until the interviewer confirms consent. */
type Comp = { key: string; label: string; guide: string; focus: boolean };

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

export default function RecordingPanel({ candidateId, competencies, candidateConsented, hasRecording }: {
  candidateId: string; competencies: Comp[]; candidateConsented: boolean; hasRecording: boolean;
}) {
  const [supported, setSupported] = useState<{ ok: boolean; reason: string } | null>(null);
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<"idle" | "recording" | "uploading" | "done" | "error">(hasRecording ? "done" : "idle");
  const [err, setErr] = useState<string | null>(null);
  const [secs, setSecs] = useState(0);
  const [caption, setCaption] = useState("");

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recogRef = useRef<{ stop: () => void; start: () => void } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secsRef = useRef(0);

  useEffect(() => {
    const secure = typeof window !== "undefined" && window.isSecureContext;
    const hasGUM = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
    const hasMR = typeof window !== "undefined" && "MediaRecorder" in window;
    if (!secure) setSupported({ ok: false, reason: "Recording needs a secure page (https:// or localhost)." });
    else if (!hasGUM || !hasMR) setSupported({ ok: false, reason: "This browser can’t record audio — use Chrome or Edge." });
    else setSupported({ ok: true, reason: "" });
    return () => { cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cleanup() {
    if (timerRef.current) clearInterval(timerRef.current);
    try { recogRef.current?.stop(); } catch { /* */ }
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }

  function pickMime(): string {
    for (const m of MIME_CANDIDATES) {
      try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* */ }
    }
    return "";
  }

  function startCaption() {
    const W = window as unknown as { SpeechRecognition?: new () => never; webkitSpeechRecognition?: new () => never };
    const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!Ctor) return;
    try {
      const r = new (Ctor as unknown as new () => {
        continuous: boolean; interimResults: boolean; lang: string;
        onresult: (e: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void;
        onend: () => void; onerror: () => void; start: () => void; stop: () => void;
      })();
      r.continuous = true; r.interimResults = true; r.lang = "en-US";
      r.onresult = (e) => {
        let finalTxt = "";
        for (let i = 0; i < e.results.length; i++) if (e.results[i].isFinal) finalTxt += e.results[i][0].transcript + " ";
        if (finalTxt) setCaption((c) => (c + finalTxt).slice(-2000));
      };
      r.onerror = () => { /* keep the recording going; caption is best-effort */ };
      r.onend = () => { if (recRef.current && recRef.current.state === "recording") { try { r.start(); } catch { /* */ } } };
      r.start();
      recogRef.current = r;
    } catch { /* caption is optional */ }
  }

  async function start() {
    setErr(null);
    // record the interview + consent snapshot first (server hard-blocks upload without it)
    try {
      const res = await fetch(`/api/candidates/${candidateId}/interview`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent_recording: true, notice_version: "v1", competencies }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error || "could not start"); return; }
    } catch { setErr("network error starting interview"); return; }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => { void upload(mr.mimeType || mime || "audio/webm"); };
      recRef.current = mr;
      mr.start(10000);
      secsRef.current = 0; setSecs(0); setCaption("");
      timerRef.current = setInterval(() => { secsRef.current += 1; setSecs(secsRef.current); }, 1000);
      startCaption();
      setPhase("recording");
    } catch (e) {
      setErr((e as Error).name === "NotAllowedError" ? "Microphone permission was denied." : `Could not access the microphone: ${(e as Error).message}`);
      setPhase("error");
    }
  }

  function stop() {
    if (timerRef.current) clearInterval(timerRef.current);
    try { recogRef.current?.stop(); } catch { /* */ }
    setPhase("uploading");
    try { recRef.current?.stop(); } catch { void upload("audio/webm"); }
  }

  async function upload(mime: string) {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    const blob = new Blob(chunksRef.current, { type: mime });
    if (blob.size === 0) { setErr("nothing was recorded"); setPhase("error"); return; }
    const fd = new FormData();
    fd.append("file", blob, "interview.webm");
    fd.append("mime_type", mime);
    fd.append("duration_sec", String(secsRef.current));
    try {
      const res = await fetch(`/api/candidates/${candidateId}/interview/recording`, { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error || "upload failed"); setPhase("error"); return; }
      setPhase("done");
    } catch { setErr("network error uploading"); setPhase("error"); }
  }

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="font-medium text-slate-800 text-[14px]">Recording &amp; live transcript</div>
        <span className="text-[12px] text-slate-500">{phase === "recording" && <span className="text-rose-600">● </span>}{fmt(secs)}</span>
      </div>

      {supported && !supported.ok && (
        <div className="mt-2 text-[12px] rounded-lg bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200 px-3 py-2">{supported.reason} You can still score the interview below without a recording.</div>
      )}

      <div className="mt-2 text-[11.5px] text-slate-500">
        Candidate’s apply-time recording consent: {candidateConsented ? <span className="text-emerald-700">yes</span> : <span className="text-rose-700">no</span>}.
      </div>
      <label className="flex gap-2 items-start my-2.5 text-[12px] text-slate-600">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={phase !== "idle"} className="mt-0.5" />
        <span>I confirm the candidate consents to this audio recording + transcript (stored privately, deletable). Recording is blocked until this is ticked.</span>
      </label>

      {phase === "idle" && (
        <button onClick={start} disabled={!consent || !(supported?.ok)} className="text-[12px] font-medium rounded-md bg-[#AE00D0] text-white px-3 py-1.5 hover:opacity-90 disabled:opacity-40">▶ Start recording</button>
      )}
      {phase === "recording" && (
        <button onClick={stop} className="text-[12px] font-medium rounded-md ring-1 ring-inset ring-rose-300 text-rose-700 px-3 py-1.5 hover:bg-rose-50">■ Stop &amp; upload</button>
      )}
      {phase === "uploading" && <div className="text-[12px] text-slate-500">Uploading recording…</div>}
      {phase === "done" && <div className="text-[12px] text-emerald-700">✓ Recording saved (private). Transcription + AI second opinion come in Phase 4b.</div>}
      {err && <div className="mt-2 text-[12px] text-rose-600">{err}</div>}

      <div className="mt-3">
        <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">live caption (draft aid, not the scored transcript)</div>
        <div className="h-24 overflow-y-auto bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-[12px] text-slate-600">
          {caption || (phase === "recording" ? "Listening…" : "The live caption appears here while recording. It’s a draft only — the real transcript is made locally with faster-whisper in Phase 4b.")}
        </div>
      </div>
    </div>
  );
}
