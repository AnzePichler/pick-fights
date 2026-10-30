"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type Status = { eventId: string; version: number; startsAt: string; lastSyncAt: string | null; enabled: boolean; needsReview: boolean; completed: boolean };

export default function LiveResultsRefresh() {
  const router = useRouter();
  const pathname = usePathname();
  const version = useRef<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [checkedAt, setCheckedAt] = useState(0);
  const relevant = ["/picks", "/leaderboard", "/events", "/my-picks"].includes(pathname) || pathname.startsWith("/users/");

  useEffect(() => {
    if (!relevant) return;
    const controller = new AbortController();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      try {
        if (document.visibilityState === "hidden") return;
        const response = await fetch("/api/events/live", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error();
        const data: { event: Status | null } = await response.json();
        if (stopped) return;
        setStatus(data.event); setUnavailable(false);
        setCheckedAt(Date.now());
        if (data.event) {
          const current = `${data.event.eventId}:${data.event.version}`;
          const stored = version.current ?? sessionStorage.getItem("pickfights-result-version");
          if (stored && stored !== current) router.refresh();
          version.current = current;
          sessionStorage.setItem("pickfights-result-version", current);
        }
      } catch {
        if (!stopped) setUnavailable(true);
      } finally {
        if (!stopped) timer = setTimeout(check, 60_000);
      }
    }
    void check();
    return () => { stopped = true; controller.abort(); clearTimeout(timer); };
  }, [relevant, router]);

  if (!relevant || !status || new Date(status.startsAt).getTime() > checkedAt) return null;
  const stale = !status.completed && status.enabled && (!status.lastSyncAt || checkedAt - new Date(status.lastSyncAt).getTime() > 15 * 60_000);
  return <div role="status" className="border-t bg-white px-4 py-1 text-center text-xs text-neutral-500">
    {unavailable || stale || status.needsReview ? "Results feed delayed · showing last saved results" : status.completed ? "Event results complete" : status.enabled ? "Automatic results · checked every six minutes" : "Showing saved results"}
    {status.lastSyncAt && ` · Last checked ${new Date(status.lastSyncAt).toUTCString()}`}
  </div>;
}
