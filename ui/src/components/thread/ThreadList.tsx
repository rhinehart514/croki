import { AlertTriangle, CheckCircle2, Circle, Clock3, Sparkles } from "lucide-react";
import type { WorkIndex, WorkIndexItem } from "@/api";

function ThreadState({ item }: { item: WorkIndexItem }) {
  if (item.attention === "decision") return <><Clock3 aria-hidden="true" /><span className="sr-only">Waiting for founder judgment</span></>;
  if (item.attention === "failure") return <><AlertTriangle aria-hidden="true" /><span className="sr-only">Failed or interrupted</span></>;
  if (item.activity !== "idle") return <><Sparkles aria-hidden="true" /><span className="sr-only">Active</span></>;
  if (item.unread) return <><CheckCircle2 aria-hidden="true" /><span className="sr-only">Unread result</span></>;
  return <><Circle aria-hidden="true" /><span className="sr-only">Quiet open thread</span></>;
}

function Rows({ items, selected, onSelect }: { items: WorkIndexItem[]; selected: string | null; onSelect: (item: WorkIndexItem) => void }) {
  return items.map((item) => <button type="button" className="thread-rail-row" data-selected={selected === item.threadRef || undefined} key={item.threadRef} onClick={() => onSelect(item)}><ThreadState item={item} /><span>{item.founderIntent}</span>{item.matchRefs?.length ? <small>{item.matchRefs.length}</small> : null}</button>);
}

function historyGroups(items: WorkIndexItem[]) {
  const startToday = new Date().setHours(0, 0, 0, 0);
  return [
    ["Today", items.filter((item) => Date.parse(item.updatedAt ?? "") >= startToday)],
    ["Yesterday", items.filter((item) => { const value = Date.parse(item.updatedAt ?? ""); return value < startToday && value >= startToday - 86_400_000; })],
    ["Last 7 days", items.filter((item) => { const value = Date.parse(item.updatedAt ?? ""); return value < startToday - 86_400_000 && value >= startToday - 604_800_000; })],
    ["Older", items.filter((item) => Date.parse(item.updatedAt ?? "") < startToday - 604_800_000)],
  ] as Array<[string, WorkIndexItem[]]>;
}

export function ThreadList({ workIndex, search, selected, onSelect }: { workIndex: WorkIndex | null; search: string; selected: string | null; onSelect: (item: WorkIndexItem) => void }) {
  const items = workIndex?.items ?? [];
  const pinned = items.filter((item) => item.pinnedAt).sort((a, b) => String(b.pinnedAt).localeCompare(String(a.pinnedAt)));
  const open = items.filter((item) => item.lifecycle !== "closed" && !item.pinnedAt);
  const closed = items.filter((item) => item.lifecycle === "closed" && !item.pinnedAt);
  return <nav className="thread-rail-list">
    {pinned.length ? <section><h2>Pinned</h2><Rows items={pinned} selected={selected} onSelect={onSelect} /></section> : null}
    <section><h2>{search ? `Results · ${workIndex?.counts.matchCount ?? 0}` : "Threads"}</h2>{open.length ? <Rows items={open} selected={selected} onSelect={onSelect} /> : <p className="thread-rail-empty">{search ? "No matching threads" : "Start with a direction"}</p>}</section>
    {!search ? <section className="thread-agent-count"><h2>Agents</h2><p>{workIndex?.counts.active ?? 0} active · {items.filter((item) => item.attention === "decision").length} waiting on you</p></section> : null}
    {!search && closed.length ? <section><h2>History</h2>{historyGroups(closed).map(([label, group]) => group.length ? <div className="thread-history" key={label}><h3>{label}</h3><Rows items={group} selected={selected} onSelect={onSelect} /></div> : null)}</section> : null}
  </nav>;
}
