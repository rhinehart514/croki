// GtmMapLens — the interactive GTM map (Phase 7 of the engine rebuild).
//
// This is where the map becomes the DECISION surface. The founder still opens onto a pre-filled,
// ranked portfolio — the engine never hands over a blank canvas — but now every path can be acted on:
//   - Portfolio: every GTM path the engine generated, ranked strongest-first, split into honest buckets.
//     Pick two or three and compare them side by side.
//   - Path: drill into one bet, read its chain buyer-first, and act on it — ask why it ranks where it
//     does, ask for variants, challenge the bet, rework any single belief in the chain, ask to shore up a
//     weak spot, or stage the whole path to your gate.
//   - Compare: two or three bets laid next to each other so the founder can choose between them.
//
// Every action that needs judgment or does work hands the decision to Claude through the composer (the
// composer IS the harness): the map pre-fills a plain-words message; the founder reads and sends. The
// map itself never edits a record, composes a run, or reaches the outside world — "stage this to my
// gate" routes to the composer, and the founder gate still owns anything outward (the wall is untouched).
// Founder register throughout — no engine word (solidity, composite, joinKey) reaches the surface.

import { useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, ChevronRight, GitCompareArrows, LoaderCircle,
  MessageCircleQuestion, RefreshCw, Route, Send, Shuffle, Swords, Telescope, TriangleAlert,
} from "lucide-react";
import {
  BUCKET_LABELS, solidityText, useGtmMap,
  type DerivedPath, type GtmMapModel, type PortfolioBucket,
} from "@/lib/gtmMapModel";
import { GateReview } from "@/components/gate/GateReview";
import type { GateDecision, GTMItem } from "@/types";
import type { GatePromote } from "@/lib/gateItem";
import "./GtmMapLens.css";

// The gate re-homed onto the map. When a staged run pauses at its founder gate, App hands the map this
// bag and the Run zoom blooms the SAME review the old canvas used (extracted GateReview) — approve /
// edit-then-approve / return, the batch clear, the autonomy ladder. The wall is untouched: onSubmit
// still banks each call into the run ledger and resumes; nothing here sends. Absent when no run is
// paused — the map then shows the portfolio as usual.
export type GateBag = {
  // The gate node the staged items belong to — App resolves the real id from the run, never synthesized.
  gateNodeId: string;
  items: GTMItem[];
  learned: number;
  offer: string | null;
  promote?: GatePromote;
  onSubmitReview: (nodeId: string, decisions: Record<string, GateDecision>) => void;
};

// The founder hands a map decision to Claude: (message, optional subject path). The host pre-fills the
// composer with the message and marks the path as the subject; the founder sends it.
type AskFn = (text: string, subject?: { id: string; label: string }) => void;

// ── The plain-words prompts each action seeds the composer with. Kept together so the founder register
// is auditable in one place — no engine vocabulary, second person, a real instruction Claude can act on. ──
const prompt = {
  why: (p: DerivedPath) =>
    `Why does the go-to-market path “${p.path.summary}” rank where it does? Walk me through what's carrying it and what's holding it back.`,
  variants: (p: DerivedPath) =>
    `Give me a few variations on the path “${p.path.summary}” — same buyer, but different offer, channel, or message — so I can compare bets.`,
  challenge: (p: DerivedPath) =>
    `Challenge the path “${p.path.summary}”. What's the weakest assumption it rests on, and what would have to be true for this bet to fail?`,
  swap: (p: DerivedPath, facet: string, current: string) =>
    `On the path “${p.path.summary}”, rework the ${facet.toLowerCase()} — right now it's “${current}”. Show me other options for it.`,
  shore: (p: DerivedPath, label: string, detail: string) =>
    `On the path “${p.path.summary}”, help me shore up a weak spot: ${label} — ${detail}. What evidence would ground it, and how could I get it?`,
  stage: (p: DerivedPath) =>
    `Compose the path “${p.path.summary}” into a run and stage it at my gate for approval. Don't send anything — I'll decide at the gate.`,
  compare: (paths: DerivedPath[]) =>
    `Compare these go-to-market paths and tell me which bet is stronger and why:\n${paths.map((p) => `• ${p.path.summary}`).join("\n")}`,
};

const subjectOf = (p: DerivedPath) => ({ id: p.path.id, label: p.path.summary });

// Strength (0..1) → the filled share of the ink track. A tiny floor stays visible so a real-but-weak
// bet never reads as literally nothing. Ink weight only — never hue (that stays semantic).
function strengthPct(score: number): number {
  return Math.round(10 + Math.min(Math.max(score, 0), 1) * 80); // 10%..90%
}

// Keep a field scannable in a dense row: clip to a word boundary near the limit, ellipsis the rest.
// The full text always lives on the path detail, so nothing is lost — the row just stays terse.
function clip(text: string, max = 46): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

// The one-line read of a bet: its first few chain steps, each clipped short, joined by arrows, so the
// portfolio row says what the path IS at a glance without opening it.
function betLine(dp: DerivedPath): string {
  return dp.chain.slice(0, 3).map((s) => clip(s.text, 28)).join("  →  ");
}

const BUCKET_ORDER: PortfolioBucket[] = ["strongest", "ready", "blocked", "worked"];
const MAX_COMPARE = 3;

// The two rituals that fill the map: research the buyer picture, then generate the ranked paths. Each
// runs on the active project, then forces the map to refetch so the founder sees the result land. Both
// only research/compose and store — neither sends, and the founder gate still owns anything outward.
type Ritual = "research" | "generate";
function RitualActions({
  busy, onResearch, onGenerate, compact = false,
}: {
  busy: Ritual | null;
  onResearch?: () => void;
  onGenerate?: () => void;
  compact?: boolean;
}) {
  if (!onResearch && !onGenerate) return null;
  const cls = compact ? "gtm-ghost-btn" : "gtm-primary-btn";
  return (
    <div className={`gtm-map-rituals${compact ? " compact" : ""}`}>
      {onResearch ? (
        <button type="button" className={cls} disabled={!!busy} onClick={onResearch}>
          {busy === "research" ? <LoaderCircle size={14} className="spin" /> : <Telescope size={14} />}
          {compact ? "Re-research" : "Research the buyer"}
        </button>
      ) : null}
      {onGenerate ? (
        <button type="button" className={cls} disabled={!!busy} onClick={onGenerate}>
          {busy === "generate" ? <LoaderCircle size={14} className="spin" /> : compact ? <RefreshCw size={14} /> : <Route size={14} />}
          {compact ? "Regenerate paths" : "Generate the paths"}
        </button>
      ) : null}
    </div>
  );
}

export function GtmMapLens({ projectId, onAsk, onResearchMarket, onGeneratePortfolio, gate }: {
  projectId: string;
  onAsk?: AskFn;
  // The founder invokes a ritual (research the buyer / generate the portfolio) for the active project.
  // The host runs it; the lens refetches when it resolves. Omitted → the lens is read-only, as before.
  onResearchMarket?: () => Promise<void> | void;
  onGeneratePortfolio?: () => Promise<void> | void;
  // A staged run paused at the founder gate. Present → the map opens on its Run zoom (the gate blooms
  // here); absent → the portfolio. This is the gate's home now, so it takes priority over every other state.
  gate?: GateBag | null;
}) {
  const [reloadToken, setReloadToken] = useState(0);
  const [busy, setBusy] = useState<Ritual | null>(null);
  const state = useGtmMap(projectId, reloadToken);
  const runRitual = async (which: Ritual) => {
    const fn = which === "research" ? onResearchMarket : onGeneratePortfolio;
    if (!fn || busy) return;
    setBusy(which);
    try {
      await fn();
      setReloadToken((t) => t + 1); // pull the freshly-persisted records back in
    } finally {
      setBusy(null);
    }
  };
  const onResearch = onResearchMarket ? () => void runRitual("research") : undefined;
  const onGenerate = onGeneratePortfolio ? () => void runRitual("generate") : undefined;

  const [openPathId, setOpenPathId] = useState<string | null>(null);
  const [filter, setFilter] = useState<PortfolioBucket | "all">("all");
  // Compare mode: a selection of path ids the founder is lining up side by side. Empty = off. Pure UI —
  // choosing paths to compare is founder reasoning, no backend and no model call.
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);

  // The gate outranks the portfolio: a run waiting on the founder is the most important thing on the map,
  // and it must show regardless of how the portfolio fetch resolves — so the Wall is never without a home.
  // Placed after the hooks (Rules of Hooks), before every portfolio state.
  if (gate) return <RunGateView gate={gate} />;

  if (state.status === "loading") {
    return (
      <div className="gtm-map gtm-map-note">
        <LoaderCircle size={18} className="spin" />
        <span>Reading your GTM map…</span>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="gtm-map gtm-map-note">
        <strong>The GTM map isn’t available yet</strong>
        <span>
          The portfolio can’t be read for this product right now. Once the engine has composed a set of
          paths, they’ll show here.
        </span>
      </div>
    );
  }
  if (state.status === "empty") {
    return (
      <div className="gtm-map gtm-map-note">
        <strong>No GTM paths yet</strong>
        <span>
          Nothing has been mapped for this product. Research the buyer picture, then generate a portfolio
          of ways to go to market — every path lands here, ranked, with its weak spots flagged, for you to
          read and act on before anything runs.
        </span>
        <RitualActions busy={busy} onResearch={onResearch} onGenerate={onGenerate} />
      </div>
    );
  }

  const model = state.model;
  const toggleCompare = (id: string) =>
    setCompareIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : ids.length >= MAX_COMPARE ? ids : [...ids, id],
    );

  // Compare zoom: two or three bets side by side.
  if (comparing) {
    const chosen = compareIds
      .map((id) => model.paths.find((p) => p.path.id === id))
      .filter((p): p is DerivedPath => !!p);
    if (chosen.length >= 2) {
      return (
        <CompareView
          paths={chosen}
          onBack={() => setComparing(false)}
          onOpen={(id) => { setComparing(false); setOpenPathId(id); }}
          onAsk={onAsk}
        />
      );
    }
    // Selection fell below two (a path got dropped) — fall back to the portfolio.
    setComparing(false);
  }

  // Path zoom: one bet's reasoning, now actionable.
  if (openPathId) {
    const dp = model.paths.find((p) => p.path.id === openPathId) ?? null;
    if (dp) return <PathView dp={dp} onBack={() => setOpenPathId(null)} onAsk={onAsk} />;
  }

  return (
    <PortfolioView
      model={model}
      filter={filter}
      onFilter={setFilter}
      onOpen={(id) => setOpenPathId(id)}
      compareIds={compareIds}
      onToggleCompare={toggleCompare}
      onStartCompare={() => setComparing(true)}
      onClearCompare={() => setCompareIds([])}
      busy={busy}
      onResearch={onResearch}
      onGenerate={onGenerate}
    />
  );
}

// ── Portfolio zoom: the whole ranked map, with side-by-side compare selection ───────────────────────
function PortfolioView({
  model, filter, onFilter, onOpen, compareIds, onToggleCompare, onStartCompare, onClearCompare,
  busy, onResearch, onGenerate,
}: {
  model: GtmMapModel;
  filter: PortfolioBucket | "all";
  onFilter: (b: PortfolioBucket | "all") => void;
  onOpen: (id: string) => void;
  compareIds: string[];
  onToggleCompare: (id: string) => void;
  onStartCompare: () => void;
  onClearCompare: () => void;
  busy: Ritual | null;
  onResearch?: () => void;
  onGenerate?: () => void;
}) {
  const shown = useMemo(
    () => (filter === "all" ? model.paths : model.paths.filter((p) => p.bucket === filter)),
    [model.paths, filter],
  );
  const selecting = compareIds.length > 0;

  return (
    <div className="gtm-map">
      <header className="gtm-map-head">
        <div className="gtm-map-title">
          <strong>Your GTM map</strong>
          <span>
            {model.paths.length} way{model.paths.length === 1 ? "" : "s"} to go to market, ranked — grounded
            in {model.truthCount} product fact{model.truthCount === 1 ? "" : "s"} and {model.marketCount} thing
            {model.marketCount === 1 ? "" : "s"} known about the buyer.
          </span>
        </div>
        <RitualActions busy={busy} onResearch={onResearch} onGenerate={onGenerate} compact />
      </header>

      <div className="gtm-map-filters" role="tablist" aria-label="Filter paths">
        <button
          type="button"
          className={`gtm-chip${filter === "all" ? " on" : ""}`}
          onClick={() => onFilter("all")}
          role="tab"
          aria-selected={filter === "all"}
        >
          All <span className="gtm-chip-count">{model.paths.length}</span>
        </button>
        {BUCKET_ORDER.map((b) => (
          <button
            key={b}
            type="button"
            className={`gtm-chip gtm-chip-${b}${filter === b ? " on" : ""}`}
            onClick={() => onFilter(filter === b ? "all" : b)}
            disabled={model.counts[b] === 0}
            role="tab"
            aria-selected={filter === b}
          >
            {BUCKET_LABELS[b]} <span className="gtm-chip-count">{model.counts[b]}</span>
          </button>
        ))}
        <span className="gtm-map-hint">Tick two or three bets to compare them.</span>
      </div>

      <div className="gtm-map-list">
        {shown.map((dp) => {
          const picked = compareIds.includes(dp.path.id);
          const full = compareIds.length >= MAX_COMPARE && !picked;
          return (
            <div key={dp.path.id} className={`gtm-path-row${picked ? " picked" : ""}`}>
              <label className="gtm-path-pick" title={full ? "You can compare up to three at once" : "Add to compare"}>
                <input
                  type="checkbox"
                  checked={picked}
                  disabled={full}
                  onChange={() => onToggleCompare(dp.path.id)}
                  aria-label={`Compare “${dp.path.summary}”`}
                />
              </label>
              <button type="button" className="gtm-path-open" onClick={() => onOpen(dp.path.id)}>
                <div className="gtm-path-strength" aria-hidden>
                  <span className="gtm-path-strength-fill" style={{ height: `${strengthPct(dp.score)}%` }} />
                </div>
                <div className="gtm-path-main">
                  <div className="gtm-path-row-head">
                    <span className={`gtm-bucket-dot gtm-chip-${dp.bucket}`} />
                    <strong>{dp.path.summary}</strong>
                  </div>
                  {betLine(dp) ? <p className="gtm-path-bet">{betLine(dp)}</p> : null}
                  <div className="gtm-path-meta">
                    <span className={`gtm-bucket-tag gtm-chip-${dp.bucket}`}>{BUCKET_LABELS[dp.bucket]}</span>
                    {dp.angle ? <span className="gtm-angle-tag">{dp.angle}</span> : null}
                    {dp.weakLinks.length > 0 ? (
                      <span className="gtm-weak-tag">
                        <TriangleAlert size={12} />
                        {dp.weakLinks.length} weak {dp.weakLinks.length === 1 ? "spot" : "spots"}
                      </span>
                    ) : null}
                  </div>
                </div>
                <ChevronRight size={16} className="gtm-path-chev" aria-hidden />
              </button>
            </div>
          );
        })}
        {shown.length === 0 ? (
          <div className="gtm-map-note gtm-map-note-inline">
            <span>No paths in this group.</span>
          </div>
        ) : null}
      </div>

      {/* Compare tray — rises when the founder has picked bets, so the choice-to-compare is one click. */}
      {selecting ? (
        <div className="gtm-compare-tray" role="region" aria-label="Compare selection">
          <span className="gtm-compare-count">
            {compareIds.length} bet{compareIds.length === 1 ? "" : "s"} picked
          </span>
          <div className="gtm-compare-tray-actions">
            <button type="button" className="gtm-ghost-btn" onClick={onClearCompare}>Clear</button>
            <button
              type="button"
              className="gtm-primary-btn"
              disabled={compareIds.length < 2}
              onClick={onStartCompare}
            >
              <GitCompareArrows size={14} /> Compare
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Path zoom: one bet's reasoning, now actionable ──────────────────────────────────────────────────
function PathView({ dp, onBack, onAsk }: { dp: DerivedPath; onBack: () => void; onAsk?: AskFn }) {
  const c = dp.contract;
  const measurable = dp.measurementParts > 0;
  const ask = (text: string) => onAsk?.(text, subjectOf(dp));

  return (
    <div className="gtm-map">
      <header className="gtm-path-detail-head">
        <button type="button" className="gtm-back" onClick={onBack}>
          <ArrowLeft size={14} /> All paths
        </button>
        <div className="gtm-path-detail-tags">
          {dp.angle ? <span className="gtm-angle-tag">{dp.angle}</span> : null}
          <span className={`gtm-bucket-tag gtm-chip-${dp.bucket}`}>{BUCKET_LABELS[dp.bucket]}</span>
        </div>
      </header>

      <div className="gtm-path-detail-body">
        <h3 className="gtm-path-detail-title">{dp.path.summary}</h3>

        {/* Interrogate this bet — every action hands a plain-words message to Claude in the composer. */}
        {onAsk ? (
          <div className="gtm-path-actions" role="group" aria-label="Ask Claude about this path">
            <button type="button" className="gtm-action" onClick={() => ask(prompt.why(dp))}>
              <MessageCircleQuestion size={14} /> Why does this rank here?
            </button>
            <button type="button" className="gtm-action" onClick={() => ask(prompt.variants(dp))}>
              <Shuffle size={14} /> Show me variants
            </button>
            <button type="button" className="gtm-action" onClick={() => ask(prompt.challenge(dp))}>
              <Swords size={14} /> Challenge this bet
            </button>
          </div>
        ) : null}

        {/* The bet chain — buyer-first, each step in plain words, weak links flagged. Each step can be
            reworked: "Swap this belief" hands that one facet to Claude for other options. */}
        <section className="gtm-section">
          <span className="gtm-section-label">The bet, step by step</span>
          <ol className="gtm-chain">
            {dp.chain.map((step, i) => {
              const sol = step.rest ? solidityText(step.rest.solidity) : null;
              return (
                <li key={step.key} className={`gtm-chain-step${step.weak ? " weak" : ""}`}>
                  <div className="gtm-chain-facet">
                    <span className="gtm-chain-facet-label">{step.label}</span>
                    {i < dp.chain.length - 1 ? <ArrowRight size={12} className="gtm-chain-arrow" aria-hidden /> : null}
                  </div>
                  <p className="gtm-chain-text">{step.text}</p>
                  <div className="gtm-chain-foot">
                    {sol ? (
                      <span className={`gtm-solidity gtm-solidity-${sol.tone}`}>{sol.label}</span>
                    ) : step.weak ? (
                      <span className="gtm-solidity gtm-solidity-weak">Nothing grounds this yet</span>
                    ) : <span />}
                    {onAsk ? (
                      <button
                        type="button"
                        className="gtm-inline-action"
                        onClick={() => ask(prompt.swap(dp, step.label, step.text))}
                      >
                        <Shuffle size={12} /> Swap this belief
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Weak links — what to shore up before this runs. Amber, the honest warning accent. Each can be
            handed to Claude to figure out what evidence would ground it. */}
        {dp.weakLinks.length > 0 ? (
          <section className="gtm-section gtm-weak-section">
            <span className="gtm-section-label">
              <TriangleAlert size={13} /> Weak spots to shore up first
            </span>
            <ul className="gtm-weak-list">
              {dp.weakLinks.map((w, i) => (
                <li key={i}>
                  <div className="gtm-weak-line">
                    <span><strong>{w.label}</strong> {w.detail}</span>
                    {onAsk ? (
                      <button
                        type="button"
                        className="gtm-inline-action"
                        onClick={() => ask(prompt.shore(dp, w.label, w.detail))}
                      >
                        Shore this up
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* What the bet rests on — the real evidence under it. */}
        {dp.rests.length > 0 ? (
          <section className="gtm-section">
            <span className="gtm-section-label">What this rests on</span>
            <ul className="gtm-rests">
              {dp.rests.map((r) => {
                const sol = solidityText(r.solidity);
                return (
                  <li key={r.id} className="gtm-rest">
                    <span className={`gtm-solidity gtm-solidity-${sol.tone}`}>{sol.label}</span>
                    <span className="gtm-rest-text">{r.statement}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {/* How it would be measured — set before anything runs. Honest when there's no plan yet. */}
        <section className="gtm-section">
          <span className="gtm-section-label">How you’d know it worked</span>
          {measurable && c ? (
            <div className="gtm-measure">
              {c.outcomeKinds.length ? (
                <p><span className="gtm-measure-key">Watching for</span> {c.outcomeKinds.join(", ")}</p>
              ) : null}
              {c.successCriteria ? (
                <p><span className="gtm-measure-key">Counts as working</span> {c.successCriteria}</p>
              ) : null}
              {c.sources.length ? (
                <p><span className="gtm-measure-key">Measured from</span> {c.sources.join(", ")}</p>
              ) : null}
            </div>
          ) : (
            <p className="gtm-measure-empty">No way to measure this yet — this bet would need a measurement plan before it could run.</p>
          )}
        </section>

        {/* The founder-facing risk on this bet, if the engine named one. */}
        {dp.path.risk ? (
          <section className="gtm-section">
            <span className="gtm-section-label">The risk</span>
            <p className="gtm-risk">{dp.path.risk}</p>
          </section>
        ) : null}

        {/* Advance this bet — compose it into a run staged at the gate. The wall is untouched: this only
            hands Claude the instruction to stage it; nothing sends until you approve at the gate. */}
        {onAsk ? (
          <div className="gtm-path-advance">
            <button type="button" className="gtm-primary-btn gtm-stage-btn" onClick={() => ask(prompt.stage(dp))}>
              <Send size={14} /> Stage this path to my gate
            </button>
            <span className="gtm-path-advance-note">Claude composes the run; nothing sends until you approve at the gate.</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Run zoom: the founder gate, on the map ──────────────────────────────────────────────────────────
// A staged run paused at its gate blooms HERE now, not on the old build canvas. This mounts the exact
// GateReview the old canvas used (extracted, pure props) so approve / edit-then-approve / return, the
// batch clear, and the autonomy ladder all behave identically — the wall's semantics are unchanged.
// When the founder decides the last item the run resumes, App drops the gate bag, and the map falls
// back to the portfolio on its own.
function RunGateView({ gate }: { gate: GateBag }) {
  return (
    <div className="gtm-map gtm-map-gate">
      <header className="gtm-map-head">
        <div className="gtm-map-title">
          <strong>A run is staged at your gate</strong>
          <span>Read each one and decide — approve, edit then approve, or return it as a draft. Nothing reaches the outside world until you approve it here.</span>
        </div>
      </header>
      <div className="gtm-map-gate-body">
        <GateReview
          items={gate.items}
          onSubmit={(decisions) => gate.onSubmitReview(gate.gateNodeId, decisions)}
          learned={gate.learned}
          promote={gate.promote}
          offer={gate.offer}
        />
      </div>
    </div>
  );
}

// ── Compare zoom: two or three bets side by side ────────────────────────────────────────────────────
function CompareView({
  paths, onBack, onOpen, onAsk,
}: {
  paths: DerivedPath[];
  onBack: () => void;
  onOpen: (id: string) => void;
  onAsk?: AskFn;
}) {
  return (
    <div className="gtm-map">
      <header className="gtm-path-detail-head">
        <button type="button" className="gtm-back" onClick={onBack}>
          <ArrowLeft size={14} /> Back to all paths
        </button>
        {onAsk ? (
          <button type="button" className="gtm-action" onClick={() => onAsk(prompt.compare(paths))}>
            <MessageCircleQuestion size={14} /> Ask Claude which is stronger
          </button>
        ) : null}
      </header>

      <div className="gtm-compare-grid" style={{ gridTemplateColumns: `repeat(${paths.length}, minmax(0, 1fr))` }}>
        {paths.map((dp) => (
          <div key={dp.path.id} className="gtm-compare-col">
            <button type="button" className="gtm-compare-col-head" onClick={() => onOpen(dp.path.id)}>
              <span className={`gtm-bucket-tag gtm-chip-${dp.bucket}`}>{BUCKET_LABELS[dp.bucket]}</span>
              <strong>{dp.path.summary}</strong>
              <span className="gtm-compare-open">Open <ChevronRight size={12} /></span>
            </button>

            <div className="gtm-compare-field">
              <span className="gtm-compare-key">The bet</span>
              <ol className="gtm-compare-chain">
                {dp.chain.map((step) => (
                  <li key={step.key} className={step.weak ? "weak" : ""}>
                    <span className="gtm-compare-facet">{step.label}</span>
                    <span>{step.text}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="gtm-compare-field">
              <span className="gtm-compare-key">Weak spots</span>
              {dp.weakLinks.length > 0 ? (
                <span className="gtm-weak-tag"><TriangleAlert size={12} /> {dp.weakLinks.length}</span>
              ) : <span className="gtm-compare-none">None flagged</span>}
            </div>

            <div className="gtm-compare-field">
              <span className="gtm-compare-key">Measurable?</span>
              <span className={dp.measurementParts > 0 ? "" : "gtm-compare-none"}>
                {dp.measurementParts >= 3 ? "Yes — a plan is set" : dp.measurementParts > 0 ? "Partly" : "Not yet"}
              </span>
            </div>

            {dp.path.risk ? (
              <div className="gtm-compare-field">
                <span className="gtm-compare-key">The risk</span>
                <span>{dp.path.risk}</span>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
