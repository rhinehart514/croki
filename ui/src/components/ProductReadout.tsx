import { EyeOff, FileCode2, Layers, ScanSearch, Target } from "lucide-react";

// The ONE "here's your product" read-out. Both the onboarding scan preview and the persisted
// "Product grounding" overlay render this same body, so the two can never drift into different
// pictures of the same product. Each caller normalizes its own data (a fresh scan vs. the stored
// repository facts) into this shape and wraps it with its own actions.
//
// Everything shown is real. A field that isn't present renders as an honest "not detected", never a
// fabricated confidence — the persisted read-out is genuinely thinner than a fresh scan (no stack or
// blind-attribution stored), and the read-out says so rather than inventing it.
export type ProductEvidence = { file: string; line?: number | string; text?: string };

// The scanner writes its headline in attribution-diagnostic shorthand — "Blind: project_created could
// not be confirmed." A founder reading their product's grounding deserves the same fact in plain,
// non-alarming words: honest about the gap, but never leading with "Blind" like an error. Anchored to
// the scanner's exact phrasings (scan.mjs) so a genuine product summary is never rewritten by accident;
// anything that doesn't match passes through untouched.
function humanizeScanHeadline(headline: string): string {
  const h = headline.trim();
  let m: RegExpExecArray | null;
  if ((m = /^Tracking gap proven: attribution is captured but missing from (.+?)\.?$/i.exec(h)))
    return `You do capture where wins come from — it's just not attached to ${m[1]} yet, so you can't tell which pipeline earned each one.`;
  if ((m = /^Blind:\s*(.+?) could not be confirmed\.?$/i.exec(h)))
    return `Couldn't find ${m[1]} firing anywhere in your code yet, so wins can't be traced back to a pipeline.`;
  if ((m = /^Blind:\s*(.+?) exists, but acquisition source is not captured\.?$/i.exec(h)))
    return `${m[1]} fires, but nothing records where it came from — so wins can't be traced back to a pipeline yet.`;
  if ((m = /^Instrumented:\s*(.+?) carries (.+?)\.?$/i.exec(h)))
    return `${m[1]} fires and carries its source, so wins can trace back to the pipeline that earned them.`;
  return h;
}

type ProductReadoutData = {
  headline?: string | null;
  productLine?: string | null;
  repoPath?: string | null;
  stack?: string[];
  winEvent?: string | null;
  evidence?: ProductEvidence[];
  blind?: { blind: boolean; reason?: string | null } | null;
  // Some fields (stack, blind) only exist on a fresh scan. When omitted, the read-out hides that
  // section entirely rather than showing an empty one — the persisted overlay has less to say and
  // shouldn't pretend otherwise.
  showStack?: boolean;
  showBlind?: boolean;
};

export function ProductReadout({ data }: { data: ProductReadoutData }) {
  const stack = (data.stack ?? []).filter(Boolean);
  const winEvent = data.winEvent?.trim() || null;
  const evidence = (data.evidence ?? []).filter(
    (c): c is ProductEvidence => !!c && typeof c === "object" && "file" in c,
  );
  const blind = data.blind?.blind === true;

  return (
    <div className="scan-preview-readout">
      <div className="scan-preview-head">
        <span className="scan-preview-eyebrow"><ScanSearch size={14} /> What it read in your product</span>
        <h2 className="scan-preview-headline">{data.headline?.trim() ? humanizeScanHeadline(data.headline) : "Read your code, but couldn't summarize it yet."}</h2>
        {data.productLine?.trim() ? <p className="scan-preview-line">{data.productLine.trim()}</p> : null}
        {data.repoPath ? <p className="scan-preview-repo"><FileCode2 size={12} /> {data.repoPath}</p> : null}
      </div>

      <div className="scan-preview-facts">
        {data.showStack !== false ? (
          <section className="scan-preview-fact">
            <span className="scan-preview-fact-label"><Layers size={13} /> Stack</span>
            {stack.length ? (
              <div className="scan-preview-chips">
                {stack.map((tech) => <span className="scan-preview-chip" key={tech}>{tech}</span>)}
              </div>
            ) : <span className="scan-preview-empty">No stack detected.</span>}
          </section>
        ) : null}

        <section className="scan-preview-fact">
          <span className="scan-preview-fact-label"><Target size={13} /> Win event</span>
          {winEvent ? (
            <>
              <code className="scan-preview-win">{winEvent}</code>
              {evidence.length ? (
                <ul className="scan-preview-evidence">
                  {evidence.map((cite, i) => (
                    <li key={`${cite.file}:${cite.line}:${i}`}>
                      <span className="scan-preview-cite-file">{cite.file}{cite.line != null ? `:${cite.line}` : ""}</span>
                      {cite.text ? <span className="scan-preview-cite-text">{cite.text}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : <span className="scan-preview-empty">Found the event, but no line citation.</span>}
            </>
          ) : <span className="scan-preview-empty">No win event detected.</span>}
        </section>

        {data.showBlind !== false && blind ? (
          <section className="scan-preview-blind">
            <span className="scan-preview-blind-label"><EyeOff size={13} /> Attribution is blind</span>
            <p>{data.blind?.reason?.trim()
              || "The win event fires, but nothing in the code records where it came from — so this product can't yet tell which pipeline earned a win. That's a real gap, not a bug in the scan."}</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
