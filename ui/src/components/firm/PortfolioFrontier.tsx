import { useEffect, useState } from "react";
import { GitBranch } from "lucide-react";
import {
  getPortfolioWall,
  type FirmVenture,
  type PortfolioFrontierEligibility,
  type PortfolioWallContext,
  type PortfolioWallGroup,
  type VentureTransferReceipt,
} from "@/api";
import { PortfolioWall } from "./PortfolioWall";
import { VentureTransfer } from "./VentureTransfer";
import "@/styles/portfolio-frontier.css";

export function PortfolioFrontier({ ventures, onOpen }: {
  ventures: FirmVenture[];
  onOpen: (venture: FirmVenture, context?: PortfolioWallContext) => void;
}) {
  const [eligibility, setEligibility] = useState<PortfolioFrontierEligibility | null>(null);
  const [groups, setGroups] = useState<PortfolioWallGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<{ venture: FirmVenture; receipt: VentureTransferReceipt } | null>(null);

  useEffect(() => {
    let live = true;
    getPortfolioWall().then((result) => {
      if (!live) return;
      setEligibility(result.eligibility);
      setGroups(result.groups);
    }).catch((cause) => {
      if (live) setError(cause instanceof Error ? cause.message : "Could not open portfolio decisions.");
    });
    return () => { live = false; };
  }, []);

  // Batch 9 is implemented but must not become founder-facing chrome until the outside-founder
  // proof gate is actually earned. A missing/error/proof-required response therefore renders no
  // teaser, locked dashboard, or alternate destination inside the one-venture wedge.
  if (eligibility?.status !== "eligible") return null;

  return (
    <section className="portfolio-frontier" aria-labelledby="portfolio-frontier-title">
      <header><GitBranch aria-hidden="true" /><div><small>Portfolio return</small><h2 id="portfolio-frontier-title">Your ventures, one review</h2><p>Venture identity groups the return. There are no scores, rankings, or global workflows.</p></div></header>
      <div className="portfolio-frontier-ready">
        <PortfolioWall groups={groups} ventures={[...ventures, ...(imported ? [imported.venture] : [])]} onOpen={onOpen} />
        <VentureTransfer ventures={ventures} onImported={(venture, receipt) => setImported({ venture, receipt })} />
        {imported ? <button type="button" className="portfolio-frontier-open-import" onClick={() => onOpen(imported.venture)}>Open {imported.venture.name} in its rebound repository</button> : null}
      </div>
      {error ? <p role="alert" className="portfolio-frontier-error">{error}</p> : null}
    </section>
  );
}
