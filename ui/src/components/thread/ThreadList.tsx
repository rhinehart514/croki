import { AlertTriangle, CheckCircle2, Circle, Clock3, LoaderCircle } from "lucide-react";
import type { WorkIndex, WorkIndexItem } from "@/api";

function ThreadState({ item }: { item: WorkIndexItem }) {
  if (item.attention === "decision") return <><Clock3 aria-hidden="true" /><span className="sr-only">Waiting for founder judgment</span></>;
  if (item.attention === "failure") return <><AlertTriangle aria-hidden="true" /><span className="sr-only">Failed or interrupted</span></>;
  if (item.activity !== "idle") return <><LoaderCircle className="thread-state-spinner" aria-hidden="true" /><span className="sr-only">Active</span></>;
  if (item.unread) return <><CheckCircle2 aria-hidden="true" /><span className="sr-only">Unread result</span></>;
  return <><Circle aria-hidden="true" /><span className="sr-only">Quiet open thread</span></>;
}

function Rows({ items, selected, onSelect }: { items: WorkIndexItem[]; selected: string | null; onSelect: (item: WorkIndexItem) => void }) {
  return items.map((item) => <button type="button" className="thread-rail-row" data-selected={selected === item.threadRef || undefined} key={item.threadRef} onClick={() => onSelect(item)}><ThreadState item={item} /><span>{item.founderIntent}</span><small>{relative(item.updatedAt)}</small></button>);
}

function relative(value: string | null) { const elapsed = Date.now() - Date.parse(value ?? ""); if (!Number.isFinite(elapsed)) return ""; if (elapsed < 3_600_000) return `${Math.max(1, Math.round(elapsed / 60_000))}m`; if (elapsed < 86_400_000) return `${Math.round(elapsed / 3_600_000)}h`; return `${Math.round(elapsed / 86_400_000)}d`; }

// Settled is derived server-side from real state (open founder decisions, live or queued runs, and a
// short activity grace window), so the rail never keeps a hand-maintained status of its own: work in
// motion or waiting on the founder sits above one quiet divider, everything else rests beneath it.
export function ThreadList({ workIndex, search, selected, onSelect }: { workIndex: WorkIndex | null; crew?: unknown[]; search: string; selected: string | null; onSelect: (item: WorkIndexItem) => void }) {
  const items = workIndex?.items ?? [];
  if (search) return <nav className="thread-rail-list"><section><h2><span>Results</span><small>{workIndex?.counts.matchCount ?? items.length}</small></h2>{items.length ? <Rows items={items} selected={selected} onSelect={onSelect} /> : <p className="thread-rail-empty">No matching threads</p>}</section></nav>;
  const pinned = items.filter((item) => item.pinnedAt).sort((a, b) => String(b.pinnedAt).localeCompare(String(a.pinnedAt)));
  const active = items.filter((item) => !item.pinnedAt && !item.settled);
  const earlier = items.filter((item) => !item.pinnedAt && item.settled);
  return <nav className="thread-rail-list">
    {pinned.length ? <section><h2><span>Pinned</span><small>{pinned.length}</small></h2><Rows items={pinned} selected={selected} onSelect={onSelect} /></section> : null}
    <section aria-label="Threads in motion">{active.length ? <Rows items={active} selected={selected} onSelect={onSelect} /> : <p className="thread-rail-empty">{items.length ? "Nothing needs you right now" : "Start with a direction"}</p>}</section>
    {earlier.length ? <section className="thread-rail-earlier" aria-label="Earlier threads"><h2><span>Earlier</span><small>{earlier.length}</small></h2><Rows items={earlier} selected={selected} onSelect={onSelect} /></section> : null}
  </nav>;
}
