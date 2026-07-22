import { Plus, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FirmVenture } from "@/api";

const SEARCH_THRESHOLD = 6;

const repositoryName = (repository: string) =>
  repository.split(/[\\/]/).filter(Boolean).at(-1) ?? repository;

const timestamp = (value: string) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function VentureSwitcher({ venture, ventures, onSwitch, onCreate }: {
  venture: FirmVenture;
  ventures: FirmVenture[];
  onSwitch: (venture: FirmVenture) => void;
  onCreate: () => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ordered = useMemo(() => [...ventures].sort((left, right) => {
    if (left.id === venture.id) return -1;
    if (right.id === venture.id) return 1;
    return timestamp(right.updatedAt) - timestamp(left.updatedAt)
      || left.name.localeCompare(right.name);
  }), [venture.id, ventures]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visible = normalizedQuery
    ? ordered.filter((candidate) => `${candidate.name} ${candidate.repository}`.toLocaleLowerCase().includes(normalizedQuery))
    : ordered;

  useEffect(() => {
    if (!open || ventures.length < SEARCH_THRESHOLD) return;
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open, ventures.length]);

  const close = () => {
    detailsRef.current?.removeAttribute("open");
    setOpen(false);
    setQuery("");
  };

  return <details ref={detailsRef} className="thread-venture-switcher" onToggle={(event) => {
    const nextOpen = event.currentTarget.open;
    setOpen(nextOpen);
    if (!nextOpen) setQuery("");
  }}>
    <summary><span>{venture.name.charAt(0)}</span><strong>{venture.name}</strong></summary>
    <div className="venture-switcher-menu">
      {ventures.length >= SEARCH_THRESHOLD ? <label className="venture-switcher-search">
        <Search aria-hidden="true" />
        <span className="sr-only">Find a venture</span>
        <input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find venture or repository" />
      </label> : null}
      <div className="venture-switcher-list">
        {visible.map((candidate) => <button className="venture-switcher-item" type="button" key={candidate.id} data-current={candidate.id === venture.id ? "true" : undefined} onClick={() => {
          if (candidate.id !== venture.id) onSwitch(candidate);
          close();
        }}>
          <span><strong>{candidate.name}</strong><small>{repositoryName(candidate.repository)}</small></span>
          {candidate.id === venture.id ? <small>Current</small> : null}
        </button>)}
        {!visible.length ? <p className="venture-switcher-empty">No matching ventures.</p> : null}
      </div>
      <button className="venture-switcher-create" type="button" onClick={() => { close(); onCreate(); }}><Plus aria-hidden="true" />Add codebase</button>
    </div>
  </details>;
}
