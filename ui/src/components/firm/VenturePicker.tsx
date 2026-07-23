import { useCallback, useEffect, useState } from "react";
import { ArrowRight, ChevronDown, Plus } from "lucide-react";
import {
  listVentures,
  type FirmVenture,
  type PortfolioWallContext,
} from "@/api";
import { CrokiMark } from "@/components/brand/CrokiMark";
import { PortfolioFrontier } from "./PortfolioFrontier";
import { VentureCreateForm } from "./VentureCreateForm";

export function VenturePicker({ onOpen }: {
  onOpen: (venture: FirmVenture, context?: PortfolioWallContext) => void;
}) {
  const [ventures, setVentures] = useState<FirmVenture[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(() => {
    let live = true;
    listVentures()
      .then((res) => { if (live) { setVentures(res.ventures); setFailed(false); } })
      .catch(() => { if (live) { setVentures([]); setFailed(true); } });
    return () => { live = false; };
  }, []);
  useEffect(() => load(), [load]);

  const hasVentures = Boolean(ventures?.length);

  return (
    <div className={`firm-app-picker${hasVentures ? " firm-app-picker-returning" : ""}`}>
      {!hasVentures ? (
        <div className="firm-app-picker-head">
          <span>Product + GTM development environment</span>
          <div className="firm-app-picker-lockup"><CrokiMark active={ventures === null} decorative /><h1>Croki</h1></div>
          <p>Change the Product and every path to market. Let agents pursue the work while you keep current truth and outward action yours.</p>
          <div className="firm-app-picker-orbit" aria-hidden="true">
            <i /><i /><i />
            <strong>{failed ? "Couldn’t reach the firm" : ventures === null ? "Opening the firm" : "No ventures yet"}</strong>
            <small>connect a real Product</small>
          </div>
        </div>
      ) : null}

      <div className="firm-app-picker-content">
        {ventures === null ? (
          <p className="firm-app-picker-loading" role="status">Loading your ventures…</p>
        ) : failed ? (
          <section className="firm-app-picker-section firm-app-picker-failed" role="alert" aria-labelledby="ventures-unavailable">
            <div className="firm-app-picker-section-head">
              <h2 id="ventures-unavailable">Couldn’t read your ventures</h2>
              <p>Croki didn’t answer this local read. Nothing on this machine changed.</p>
            </div>
            <button type="button" className="firm-app-picker-retry" onClick={() => { setVentures(null); setFailed(false); load(); }}>Try again</button>
          </section>
        ) : ventures.length === 0 ? (
          <section className="firm-app-picker-section" aria-labelledby="start-first-venture">
            <div className="firm-app-picker-section-head">
              <h2 id="start-first-venture">Move from the real Product</h2>
              <p>Choose its codebase. Croki reads it locally and opens Work.</p>
            </div>
            <VentureCreateForm ventures={ventures} onCreated={onOpen} />
          </section>
        ) : (
          <>
          <section className="firm-app-picker-section firm-app-picker-continue" aria-labelledby="continue-venture">
            <header className="firm-app-picker-returning-head">
              <span className="firm-app-brand"><CrokiMark active={ventures === null} decorative />Croki</span>
              <h1 id="continue-venture">Resume work</h1>
              <p>Return to a product to review what changed and keep moving.</p>
            </header>
            <ul className="firm-app-picker-list">
              {ventures.map((venture) => (
                <li key={venture.id}>
                  <button type="button" onClick={() => onOpen(venture)}>
                    <span>
                      <strong>{venture.name}</strong>
                      <small>Product repository · {venture.repository.split("/").filter(Boolean).at(-1) ?? "connected"}</small>
                    </span>
                    <em>Resume work <ArrowRight aria-hidden="true" /></em>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="firm-app-picker-new" aria-labelledby="start-another-venture">
            <button
              type="button"
              className="firm-app-picker-new-toggle"
              aria-expanded={createOpen}
              aria-controls={createOpen ? "new-venture-form" : undefined}
              onClick={() => setCreateOpen((open) => !open)}
            >
              <Plus aria-hidden="true" />
              <span>
                <strong id="start-another-venture">Add another codebase</strong>
                <small>Each product keeps its work, evidence, and decisions separate.</small>
              </span>
              <ChevronDown aria-hidden="true" />
            </button>
            {createOpen ? <VentureCreateForm id="new-venture-form" ventures={ventures} onCreated={onOpen} /> : null}
          </section>

          <PortfolioFrontier ventures={ventures} onOpen={onOpen} />
          </>
        )}
      </div>
    </div>
  );
}
