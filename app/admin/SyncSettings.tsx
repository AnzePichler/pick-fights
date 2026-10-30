"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Mapping = { fightId: string; providerFightId: string; swap: boolean };
type Card = { id: string; title: string; starts_at: string; card: { id: string; fighter_a: { name: string } | null; fighter_b: { name: string } | null }[] };
type Props = {
  event: { id: string; startsAt: string; providerEventId: string | null; syncEnabled: boolean; lastSyncAt: string | null; lastSyncError: string | null; nextSyncAt: string | null;
    fights: { id: string; fighterA: string; fighterB: string; manual: boolean }[] };
};

export default function SyncSettings({ event }: Props) {
  const router = useRouter();
  const [providerId, setProviderId] = useState(event.providerEventId ?? "");
  const [provider, setProvider] = useState<Card | null>(null);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [timingWarning, setTimingWarning] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function preview() {
    setBusy(true); setMessage(""); setProvider(null); setMappings([]);
    try {
      const response = await fetch(`/api/admin/sync?eventId=${encodeURIComponent(event.id)}&providerEventId=${encodeURIComponent(providerId)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setProvider(data.provider); setMappings(data.suggestions); setTimingWarning(data.timingWarning);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Preview failed."); }
    finally { setBusy(false); }
  }

  async function execute(action: string, extra = {}) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, eventId: event.id, ...extra }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessage(data.state ? `Sync: ${data.state}.` : "Settings saved.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Request failed."); }
    finally { setBusy(false); }
  }

  return <section className="mb-6 space-y-4 rounded-3xl bg-white p-6 shadow-sm">
    <h2 className="text-xl font-black">Automatic results · UFCalendar</h2>
    <p className="text-sm text-neutral-600">{event.syncEnabled ? "Enabled" : "Disabled"} · Every six minutes from {new Date(event.startsAt).toUTCString()}. Scheduler must be configured separately.</p>
    <p className="text-sm text-neutral-500">Last success: {event.lastSyncAt ? new Date(event.lastSyncAt).toUTCString() : "Never"}. Next: {event.nextSyncAt ? new Date(event.nextSyncAt).toUTCString() : "Not scheduled"}.</p>
    {event.lastSyncError && <p role="alert" className="text-sm font-semibold text-red-600">{event.lastSyncError}</p>}
    <div className="flex flex-wrap gap-3">
      <input aria-label="UFCalendar event ID or slug" value={providerId} onChange={(input) => { setProviderId(input.target.value); setProvider(null); setMappings([]); }} placeholder="UFCalendar event ID or slug" className="min-w-0 flex-1 rounded-xl border p-3" />
      <button disabled={busy || !providerId} onClick={preview} className="rounded-xl bg-neutral-100 px-4 py-2 font-bold disabled:opacity-50">Preview mapping</button>
      <button disabled={busy || !event.syncEnabled} onClick={() => execute("sync")} className="rounded-xl bg-neutral-100 px-4 py-2 font-bold disabled:opacity-50">Sync now</button>
      <button disabled={busy || !event.syncEnabled} onClick={() => execute("disable")} className="rounded-xl bg-neutral-100 px-4 py-2 font-bold disabled:opacity-50">Disable</button>
    </div>
    {provider && <div className="space-y-4">
      <p className="font-bold">{provider.title} · {new Date(provider.starts_at).toUTCString()}</p>
      {timingWarning && <p className="text-sm font-semibold text-amber-700">Provider and database start times differ. Verify the database uses the first prelim time; saving this mapping will not change pick deadlines.</p>}
      <p className="text-sm text-neutral-600">Review every pairing and corner before enabling. Exact-name suggestions are not automatically approved.</p>
      {mappings.map((mapping) => {
        const local = event.fights.find((fight) => fight.id === mapping.fightId)!;
        return <div key={mapping.fightId} className="space-y-2 rounded-xl border p-3">
          <p className="text-sm font-bold">Local A: {local.fighterA} · Local B: {local.fighterB}</p>
          <select aria-label={`Provider fight for ${local.fighterA} vs ${local.fighterB}`} value={mapping.providerFightId} onChange={(input) => setMappings((current) => current.map((entry) => entry.fightId === mapping.fightId ? { ...entry, providerFightId: input.target.value, swap: false } : entry))} className="w-full rounded-lg border p-2">
            <option value="">Choose provider fight</option>
            {provider.card.map((fight) => <option key={fight.id} value={fight.id}>Provider A: {fight.fighter_a?.name ?? "TBA"} · Provider B: {fight.fighter_b?.name ?? "TBA"}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mapping.swap} onChange={(input) => setMappings((current) => current.map((entry) => entry.fightId === mapping.fightId ? { ...entry, swap: input.target.checked } : entry))} />Swap provider corners (local A = provider B)</label>
        </div>;
      })}
      <button disabled={busy || mappings.some((mapping) => !mapping.providerFightId)} onClick={() => execute("configure", { providerEventId: provider.id, mappings })} className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white disabled:opacity-50">Confirm mappings and enable sync</button>
    </div>}
    <div className="space-y-2 border-t pt-4">
      <p className="text-sm text-neutral-600">Manual results are protected. Release a result only if UFCalendar should manage future corrections.</p>
      {event.fights.filter((fight) => fight.manual).map((fight) => <button key={fight.id} disabled={busy} onClick={() => execute("release", { fightId: fight.id })} className="mr-2 rounded-xl border px-3 py-2 text-sm disabled:opacity-50">Release override: {fight.fighterA} vs {fight.fighterB}</button>)}
      {event.fights.filter((fight) => !fight.manual).map((fight) => <button key={fight.id} disabled={busy} onClick={() => execute("protect", { fightId: fight.id })} className="mr-2 rounded-xl border px-3 py-2 text-sm disabled:opacity-50">Protect result: {fight.fighterA} vs {fight.fighterB}</button>)}
    </div>
    {message && <p role="status" className="text-sm font-semibold">{message}</p>}
  </section>;
}
