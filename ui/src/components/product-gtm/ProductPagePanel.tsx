import { useState } from "react";
import { replyInConversation } from "@/api";
import type { ProductGtmPageData } from "./productGtmProjection";

// The in-place expansion of a page on the Product / GTM canvas. Product territory is the product itself,
// mapped as its pages; clicking one shows an honest, cited read of what the page is now and takes a
// brain-dump of what should be different — which mints an exact Work Thread scoped to that page and
// follows it into Work (AGENTS.md §Boundaries; docs/FIRM-SPEC.md, 2026-07-22). There is no planning
// layer and no Croki persona between the founder and the SDK: the founder's words become the direction.

// The bounded repository citation behind a page read, rendered as the exact file and line range the
// summary was drawn from rather than an opaque digest.
function citation(sourceRef: string): string | null {
  const match = sourceRef.match(/^repository:(.+?)#L(\d+)-L(\d+):/);
  if (!match) return null;
  const [, file, from, to] = match;
  return from === to ? `${file}:${from}` : `${file}:${from}–${to}`;
}

export function ProductPagePanel({ ventureId, name, summary, pageRef, page, readOnly, onOpenWork }: {
  ventureId: string;
  name: string;
  summary: string;
  pageRef: string;
  page: ProductGtmPageData;
  readOnly: boolean;
  onOpenWork: (threadRef: string) => void;
}) {
  const [intent, setIntent] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cite = citation(page.sourceRef) ?? page.file;
  const adoptedConsequences = page.attachments.filter((attachment) =>
    attachment.assertion === "founder-asserted"
    && ["consequence", "product-consequence", "product-delta"].includes(attachment.type?.toLowerCase() ?? "")
  );

  const submit = async (message: string, failure: string) => {
    if (!message || pending || readOnly) return;
    setPending(true);
    setError(null);
    try {
      const result = await replyInConversation(ventureId, {
        message,
        subjectRefs: [pageRef],
        mode: "context",
        productGtmView: true,
      });
      if (result.act === "new-direction" && result.threadRef) {
        // The dump has become a Thread and is already the first turn of its transcript. Leaving it in the
        // box left a live "Start work on this page" sitting over words that had already landed, one click
        // from a duplicate Thread; the canvas stays open behind the Thread, so the founder sees both.
        setIntent("");
        onOpenWork(result.threadRef);
        return;
      }
      setError(failure);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The direction could not start.");
    } finally {
      setPending(false);
    }
  };

  const start = () => void submit(intent.trim(), "That direction did not open a Work Thread. Nothing was changed.");
  const connectToMarket = () => void submit(
    `Connect the adopted Product consequence for the ${name} page to market. First assess whether it belongs in an existing play; otherwise draft a new play with explicit intended steps. Return the join or play as an adoptable proposal.`,
    "This Product change could not be connected to market. Nothing was changed.",
  );

  return <section className="product-page-panel" aria-label={`${name} page`}>
    {/* This panel only ever opens inside the page's own node, whose pill face already carries the icon
        and the name — repeating both here put the same title on screen twice within fifty pixels. The
        route is the one part of the page's identity the pill does not show, so it is all that remains. */}
    <p className="product-page-panel-route">{page.route}</p>

    <div className="product-page-panel-now">
      <p className="product-page-panel-eyebrow">What it is now</p>
      <p className="product-page-panel-summary">{summary}</p>
      <p className="product-page-panel-cite" title={page.sourceRef}>Read from {cite}</p>
    </div>

    {page.priorDirection.length ? <div className="product-page-panel-prior">
      <p className="product-page-panel-eyebrow">Your prior direction</p>
      <ul>{page.priorDirection.map((line, index) => <li key={index}>{line}</li>)}</ul>
    </div> : null}

    {page.entryPaths?.length || page.onwardPaths?.length ? <div className="product-page-panel-paths">
      <p className="product-page-panel-eyebrow">Known user paths</p>
      <dl>
        {page.entryPaths?.map((entry) => <div key={`entry:${entry.ref}`}><dt>Arrives from</dt><dd>{entry.name}<small>{entry.route}</small></dd></div>)}
        {page.onwardPaths?.map((entry) => <div key={`onward:${entry.ref}`}><dt>Continues to</dt><dd>{entry.name}<small>{entry.route}</small></dd></div>)}
      </dl>
    </div> : null}

    {page.attachments.length ? <div className="product-page-panel-attached">
      <p className="product-page-panel-eyebrow">What this page is about</p>
      <ul>{page.attachments.map((attachment, index) => <li key={index}>
        <b>{attachment.kind}</b>
        <span>{attachment.name || attachment.statement}</span>
      </li>)}</ul>
    </div> : null}

    <div className="product-page-panel-intent">
      <label htmlFor={`page-intent-${pageRef}`}>What should be different—and for whom?</label>
      <textarea
        id={`page-intent-${pageRef}`}
        value={intent}
        onChange={(event) => setIntent(event.target.value)}
        onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") start(); }}
        placeholder={`Describe the change to ${name}. Claude or Codex takes it from here.`}
        rows={3}
        disabled={pending || readOnly}
      />
      {error ? <p className="product-page-panel-error" role="status">{error}</p> : null}
      <button type="button" className="product-page-panel-start" onClick={() => start()} disabled={pending || readOnly || !intent.trim()}>
        {pending ? "Starting…" : "Start work on this page"}
      </button>
    </div>

    {adoptedConsequences.length ? <div className="product-page-panel-gtm">
      <p className="product-page-panel-eyebrow">Take it to market</p>
      <button type="button" className="product-page-panel-play" onClick={() => connectToMarket()} disabled={pending || readOnly}>
        Connect this change to market
      </button>
      <p className="product-page-panel-gtm-note">An agent proposes a play to join, or a new drafted play.</p>
    </div> : null}
  </section>;
}
