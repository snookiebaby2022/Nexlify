"use client";

import { useState, useRef, useCallback } from "react";

export default function VoiceQueryPage() {
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [transcription, setTranscription] = useState("");
  const [results, setResults] = useState<Record<string, unknown>[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    setError("");
    setTranscription("");
    setResults([]);
    setCount(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await sendAudio(blob);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      setError("Microphone access denied or unavailable");
    }
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }, []);

  async function sendAudio(blob: Blob) {
    setLoading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("audio", blob, "recording.webm");
      const res = await fetch("/api/admin/ai/voice-query", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to process audio");
        return;
      }
      const data = await res.json();
      setTranscription(data.transcription ?? "");
      setResults(data.results ?? []);
      setCount(data.count ?? 0);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Voice Query</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Query your panel data using voice commands.
        </p>
      </div>

      <div
        className="rounded-lg border p-8 flex flex-col items-center gap-6"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        <div className="relative">
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            disabled={loading}
            className="w-20 h-20 rounded-full flex items-center justify-center transition-all disabled:opacity-60"
            style={{
              background: recording ? "#ef4444" : "var(--accent)",
              color: "white",
              boxShadow: recording
                ? "0 0 0 4px rgba(239,68,68,0.2)"
                : "none",
            }}
          >
            {recording ? (
              <svg
                className="w-8 h-8"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              <svg
                className="w-8 h-8"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
            )}
          </button>
          {recording && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 animate-ping" />
          )}
        </div>

        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {recording
            ? "Recording... Click to stop"
            : loading
            ? "Processing..."
            : "Click the microphone to start"}
        </p>

        {error && (
          <div
            className="text-sm rounded border p-3 w-full"
            style={{ borderColor: "var(--border)", color: "#f87171" }}
          >
            {error}
          </div>
        )}
      </div>

      {transcription && (
        <div
          className="rounded-lg border p-4 space-y-2"
          style={{ borderColor: "var(--border)", background: "var(--card)" }}
        >
          <h2 className="text-sm font-medium" style={{ color: "var(--muted)" }}>
            Transcription
          </h2>
          <p className="text-sm">{transcription}</p>
        </div>
      )}

      {count !== null && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {count} result{count !== 1 ? "s" : ""} found
        </p>
      )}

      {results.length > 0 && (
        <div
          className="rounded-lg border overflow-hidden"
          style={{ borderColor: "var(--border)", background: "var(--card)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {Object.keys(results[0]).map((key) => (
                  <th
                    key={key}
                    className="text-left px-4 py-3 font-medium capitalize"
                  >
                    {key.replace(/([A-Z])/g, " $1")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((row, i) => (
                <tr
                  key={i}
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  {Object.values(row).map((val, j) => (
                    <td key={j} className="px-4 py-2">
                      {typeof val === "object" ? JSON.stringify(val) : String(val ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
