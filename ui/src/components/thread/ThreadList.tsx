import { AlertTriangle, CheckCircle2, ChevronRight, Circle, Clock3, LoaderCircle } from "lucide-react";
import { useState } from "react";
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
function historyGroups(items: WorkIndexItem[]) {
  const startToday = new Date().setHours(0, 0, 0, 0);
  return [
    ["Today", items.filter((item) => Date.parse(item.updatedAt ?? "") >= startToday)],
    ["Yesterday", items.filter((item) => { const value = Date.parse(item.updatedAt ?? ""); return value < startToday && value >= startToday - 86_400_000; })],
    ["Last 7 days", items.filter((item) => { const value = Date.parse(item.updatedAt ?? ""); return value < startToday - 86_400_000 && value >= startToday - 604_800_000; })],
    ["Older", items.filter((item) => Date.parse(item.updatedAt ?? "") < startToday - 604_800_000)],
  ] as Array<[string, WorkIndexItem[]]>;
}

export function ThreadList({ workIndex, search, selected, onSelect }: { workIndex: WorkIndex | null; crew?: unknown[]; search: string; selected: string | null; onSelect: (item: WorkIndexItem) => void }) {
  const items = workIndex?.items ?? [];
  const pinned = items.filter((item) => item.pinnedAt).sort((a, b) => String(b.pinnedAt).localeCompare(String(a.pinnedAt)));
  const active = items.filter((item) => item.activity !== "idle" && !item.pinnedAt);
  const review = items.filter((item) => item.activity === "idle" && item.attention !== "none" && !item.pinnedAt);
  const recent = items.filter((item) => item.activity === "idle" && item.attention === "none" && !item.pinnedAt).slice(0, search ? undefined : 12);
  const older = items.filter((item) => item.lifecycle === "closed" && !recent.includes(item) && !item.pinnedAt);
  const recentSelected = recent.some((item) => selected === item.threadRef);
  const [recentExpanded, setRecentExpanded] = useState(false);
  const recentOpen = review.length < 5 || recentSelected || recentExpanded;
  if (search) return <nav className="thread-rail-list"><section><h2><span>Results</span><small>{workIndex?.counts.matchCount ?? items.length}</small></h2>{items.length ? <Rows items={items} selected={selected} onSelect={onSelect} /> : <p className="thread-rail-empty">No matching threads</p>}</section></nav>;
  return <nav className="thread-rail-list">
    {pinned.length ? <section><h2><span>Pinned</span><small>{pinned.length}</small></h2><Rows items={pinned} selected={selected} onSelect={onSelect} /></section> : null}
    {active.length ? <section><h2><span>Active</span><small>{active.length}</small></h2><Rows items={active} selected={selected} onSelect={onSelect} /></section> : null}
    {review.length ? <section><h2><span>Needs review</span><small>{review.length}</small></h2><Rows items={review} selected={selected} onSelect={onSelect} /></section> : null}
    <details className="thread-list-disclosure" open={recentOpen} onToggle={(event) => { if (review.length >= 5 && !recentSelected) setRecentExpanded(event.currentTarget.open); }}>
      <summary><ChevronRight aria-hidden="true" /><span>Recent</span><small>{recent.length}</small></summary>
      <div>{recent.length ? <Rows items={recent} selected={selected} onSelect={onSelect} /> : <p className="thread-rail-empty">Start with a direction</p>}</div>
    </details>
    {older.length ? <details className="thread-history"><summary>Older work</summary>{historyGroups(older).map(([label, group]) => group.length ? <div key={label}><h3>{label}</h3><Rows items={group} selected={selected} onSelect={onSelect} /></div> : null)}</details> : null}
  </nav>;
}
