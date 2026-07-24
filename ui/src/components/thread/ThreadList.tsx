import { AlertTriangle, CheckCircle2, Circle, Clock3, LoaderCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { WorkIndex, WorkIndexItem } from "@/api";
import { rowMotion } from "@/lib/motion";

type ThreadStateKind = "decision" | "failure" | "active" | "unread" | "quiet";
export type ThreadSearchStatus = "idle" | "searching" | "ready" | "error";

const STATE_LABEL: Record<ThreadStateKind, string> = {
  decision: "Waiting for founder judgment",
  failure: "Failed or interrupted",
  active: "Active",
  unread: "Unread result",
  quiet: "Quiet open thread",
};

function threadState(item: WorkIndexItem): ThreadStateKind {
  if (item.attention === "decision") return "decision";
  if (item.attention === "failure") return "failure";
  if (item.activity !== "idle") return "active";
  if (item.unread) return "unread";
  return "quiet";
}

function ThreadState({ state }: { state: ThreadStateKind }) {
  const label = <span className="sr-only">{STATE_LABEL[state]}</span>;
  if (state === "decision") return <><Clock3 aria-hidden="true" />{label}</>;
  if (state === "failure") return <><AlertTriangle aria-hidden="true" />{label}</>;
  if (state === "active") return <><LoaderCircle className="thread-state-spinner" aria-hidden="true" />{label}</>;
  if (state === "unread") return <><CheckCircle2 aria-hidden="true" />{label}</>;
  return <><Circle aria-hidden="true" />{label}</>;
}

// initial={false} keeps first paint (and the skeleton→rows swap) instant; only rows
// that arrive, leave, or reorder while the founder watches animate.
function Rows({ items, selected, onSelect }: { items: WorkIndexItem[]; selected: string | null; onSelect: (item: WorkIndexItem) => void }) {
  return <AnimatePresence initial={false} mode="popLayout">
    {items.map((item) => {
      const state = threadState(item);
      return <motion.button type="button" className="thread-rail-row" data-state={state} data-selected={selected === item.threadRef || undefined} key={item.threadRef} title={item.founderIntent} onClick={() => onSelect(item)} {...rowMotion}><ThreadState state={state} /><span>{item.founderIntent}</span><small>{relative(item.updatedAt)}</small></motion.button>;
    })}
  </AnimatePresence>;
}

// Elapsed time reads the way a founder narrates it: fresh work in minutes and hours, older work in days,
// then weeks, months, years — so a long-quiet thread says "3mo", never a raw "94d". A missing timestamp
// stays blank rather than inventing a moment.
function relative(value: string | null) {
  const elapsed = Date.now() - Date.parse(value ?? "");
  if (!Number.isFinite(elapsed)) return "";
  if (elapsed < 60_000) return "now";
  if (elapsed < 3_600_000) return `${Math.round(elapsed / 60_000)}m`;
  if (elapsed < 86_400_000) return `${Math.round(elapsed / 3_600_000)}h`;
  if (elapsed < 604_800_000) return `${Math.round(elapsed / 86_400_000)}d`;
  if (elapsed < 2_592_000_000) return `${Math.round(elapsed / 604_800_000)}w`;
  if (elapsed < 31_536_000_000) return `${Math.round(elapsed / 2_592_000_000)}mo`;
  return `${Math.round(elapsed / 31_536_000_000)}y`;
}

function SkeletonRows() {
  return <div className="thread-rail-skeleton" aria-hidden="true">{[68, 84, 52, 76, 60].map((width, index) => <div key={index} className="thread-rail-skeleton-row"><span /><span style={{ width: `${width}%` }} /></div>)}</div>;
}

// Settled is derived server-side from real state (open founder decisions, live or queued runs, and a
// short activity grace window), so the rail never keeps a hand-maintained status of its own: work in
// motion or waiting on the founder sits above one quiet divider, everything else rests beneath it.
export function ThreadList({ workIndex, search, searchStatus = "ready", loading = false, selected, onSelect }: { workIndex: WorkIndex | null; crew?: unknown[]; search: string; searchStatus?: ThreadSearchStatus; loading?: boolean; selected: string | null; onSelect: (item: WorkIndexItem) => void }) {
  const items = workIndex?.items ?? [];
  if (search) return <nav className="thread-rail-list"><section><h2><span>Results</span><small>{workIndex?.counts.matchCount ?? items.length}</small></h2>{
    searchStatus === "error"
      ? <p className="thread-rail-empty" role="alert">Search didn’t run — clear it to see every thread.</p>
      : items.length ? <Rows items={items} selected={selected} onSelect={onSelect} /> : <p className="thread-rail-empty">No matching threads</p>
  }</section></nav>;
  if (loading && !items.length) return <nav className="thread-rail-list"><SkeletonRows /></nav>;
  const pinned = items.filter((item) => item.pinnedAt).sort((a, b) => String(b.pinnedAt).localeCompare(String(a.pinnedAt)));
  const active = items.filter((item) => !item.pinnedAt && !item.settled);
  const earlier = items.filter((item) => !item.pinnedAt && item.settled);
  const labelActive = active.length > 0 && (pinned.length > 0 || earlier.length > 0);
  return <nav className="thread-rail-list">
    {pinned.length ? <section><h2><span>Pinned</span><small>{pinned.length}</small></h2><Rows items={pinned} selected={selected} onSelect={onSelect} /></section> : null}
    <section aria-label="Threads in motion">{labelActive ? <h2><span>In motion</span><small>{active.length}</small></h2> : null}{active.length ? <Rows items={active} selected={selected} onSelect={onSelect} /> : <p className="thread-rail-empty">{items.length ? "Nothing needs you right now" : "Start with a direction"}</p>}</section>
    {earlier.length ? <section className="thread-rail-earlier" aria-label="Earlier threads"><h2><span>Earlier</span><small>{earlier.length}</small></h2><Rows items={earlier} selected={selected} onSelect={onSelect} /></section> : null}
  </nav>;
}
