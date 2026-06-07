"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Manual data refresh: runs the fast incremental pipeline (last sessions + live
// index/FII-DII snapshots + KNN Multibagger Radar), then reloads the server
// components so the new numbers appear. Local-only (needs the Python pipeline).
export default function SyncButton() {
  const router = useRouter();
  const [state, setState] = useState("idle"); // idle | syncing | done | error
  const [msg, setMsg] = useState("");

  async function sync() {
    if (state === "syncing") return;
    setState("syncing");
    setMsg("");
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setState("done");
        setMsg(`Updated in ${data.elapsed ?? "?"}s`);
        router.refresh(); // pull fresh server-rendered data
        setTimeout(() => setState("idle"), 4000);
      } else {
        setState("error");
        setMsg(data.error || "Sync failed");
        setTimeout(() => setState("idle"), 6000);
      }
    } catch (e) {
      setState("error");
      setMsg("Sync request failed");
      setTimeout(() => setState("idle"), 6000);
    }
  }

  const tone =
    state === "error" ? "text-down border-down/40 hover:border-down"
    : state === "done" ? "text-up border-up/40 hover:border-up"
    : "text-muted border-line hover:text-white hover:border-accent";

  const label =
    state === "syncing" ? "Syncing…"
    : state === "done" ? (msg || "Updated")
    : state === "error" ? (msg || "Failed")
    : "Sync";

  return (
    <button
      onClick={sync}
      disabled={state === "syncing"}
      title={state === "idle" ? "Refresh latest data now" : msg || label}
      aria-label="Refresh latest data"
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-80 ${tone}`}
    >
      <svg
        viewBox="0 0 24 24" width="13" height="13" fill="none"
        stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
        className={state === "syncing" ? "animate-spin" : ""}
      >
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
