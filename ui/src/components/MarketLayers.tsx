import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Loader2, PenLine, RefreshCw } from "lucide-react";
import { researchMarketLayer, saveMarketObject, type MarketCandidate } from "@/api";
import "@/styles/market-layers.css";

// The market picture, built one layer at a time. Claude does the research labor and lays a spread of
// real alternatives for the next facet; the founder decides each layer and learns the shape by choosing
// it — comprehension over convergence. Nothing persists until a pick; the pick lands on the graph.

function kindLabel(kind: string) {
  return String(kind || "facet").replace(/_/g, " ");
}

function Solidity({ value }: { value?: string | null }) {
  const s = value || "unsupported";
  return <span className={`mkl-sol ${s}`}>{s}</span>;
}

export function MarketLayers({ projectId }: { projectId: string }) {
  const [settled, setSettled] = useState<MarketCandidate[]>([]);
  const [kind, setKind] = useState<string>("");
  const [candidates, setCandidates] = useState<MarketCandidate[]>([]);
  const [connected, setConnected] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ownDraft, setOwnDraft] = useState("");
  const startedRef = useRef(false);

  const research = useCallback(async (upstream: MarketCandidate[]) => {
    setLoading(true);
    setError(null);
    setCandidates([]);
    setOwnDraft("");
    try {
      const r = await researchMarketLayer(projectId, null, upstream);
      setKind(r.kind);
      setCandidates(r.candidates ?? []);
      setConnected(r.meta?.connected !== false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void research([]);
  }, [research]);

  const commit = useCallback(async (object: MarketCandidate) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const { object: stored } = await saveMarketObject(projectId, object);
      const nextSettled = [...settled, stored];
      setSettled(nextSettled);
      await research(nextSettled);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
      return;
    }
    setSaving(false);
  }, [projectId, settled, saving, research]);

  const pickOwn = useCallback(() => {
    const text = ownDraft.trim();
    if (!text) return;
    void commit({ kind, statement: text, declaredSolidity: "founder", solidity: "founder", evidence: [] });
  }, [ownDraft, kind, commit]);

  return (
    <div className="mkl">
      <div className="mkl-head">
        <div className="mkl-eyebrow">Market picture · one layer at a time</div>
        <p className="mkl-lede">Claude researches the alternatives. You decide each layer — and learn your buyer by choosing it.</p>
      </div>

      {settled.length ? (
        <ol className="mkl-trail">
          {settled.map((s, i) => (
            <li className="mkl-trail-step" key={i}>
              <span className="mkl-trail-kind">{kindLabel(s.kind)}</span>
              <span className="mkl-trail-stmt">{s.statement}</span>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="mkl-now">
        <div className="mkl-now-head">
          <span className="mkl-now-kind">{kind ? kindLabel(kind) : "next layer"}</span>
          {settled.length ? <span className="mkl-now-sub">grounded in your {settled.length} pick{settled.length === 1 ? "" : "s"} above</span> : <span className="mkl-now-sub">start of the picture</span>}
          <button type="button" className="mkl-refresh" onClick={() => void research(settled)} disabled={loading || saving} aria-label="Research this layer again">
            <RefreshCw size={13} />
          </button>
        </div>

        {loading ? (
          <div className="mkl-state"><Loader2 size={15} className="mkl-spin" /> Researching {kind ? kindLabel(kind) : "the next facet"} candidates…</div>
        ) : error ? (
          <div className="mkl-state error">Couldn't research this layer — {error} <button type="button" onClick={() => void research(settled)}>Try again</button></div>
        ) : !candidates.length ? (
          <div className="mkl-state">
            {connected
              ? "No candidates came back for this layer. Write your own below, or research again."
              : "Claude isn't connected, so there's nothing to research yet — connect it, or write your own facet below."}
          </div>
        ) : (
          <div className="mkl-cands">
            {candidates.map((c, i) => (
              <button type="button" className="mkl-cand" key={i} onClick={() => void commit(c)} disabled={saving}>
                <div className="mkl-cand-top"><Solidity value={c.solidity ?? c.declaredSolidity} /><span className="mkl-pick"><Check size={13} /> Pick</span></div>
                <p className="mkl-cand-stmt">{c.statement}</p>
              </button>
            ))}
          </div>
        )}

        <div className="mkl-own">
          <div className="mkl-own-head"><PenLine size={12} /> Or say it in your own words</div>
          <div className="mkl-own-row">
            <input
              className="mkl-own-input"
              value={ownDraft}
              onChange={(e) => setOwnDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") pickOwn(); }}
              placeholder={`Your take on the ${kind ? kindLabel(kind) : "next facet"}…`}
              disabled={saving}
            />
            <button type="button" className="mkl-own-go" onClick={pickOwn} disabled={saving || !ownDraft.trim()}>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
