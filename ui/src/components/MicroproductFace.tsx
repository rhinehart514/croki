import { motion } from "motion/react";
import { Lock, Check, LoaderCircle, ExternalLink, Monitor } from "lucide-react";
import { SPRING } from "@/lib/springs";

// MicroproductFace — a built microproduct rendered as a LIVING node face. Not an icon, not a status
// row: the actual thing, shown. A small live-preview frame holds the built static artifact (its real
// page rendered inline from the self-contained HTML the producer cut, or a screenshot fallback), and
// below it the building → staged → shipped state.
//
// The wall is visible here, and there is no ship button on the card by design. The microproduct is
// composed and built locally, then STAGED behind the founder gate in one move — so the face lands in
// the `staged` state and says so honestly ("Waiting at your gate — approve there to deploy"). The live
// deploy is a founder act performed AT THE GATE (the approvals panel), never a button on this card that
// could quietly push a site to the world. Shipped is the proven/green end state with the real live URL.
//
// Presentational: the App summon builds the Microproduct from the staged gate item (its entry HTML
// becomes the inline preview) and renders it inside a CanvasCard.

export type MicroproductState = "building" | "built" | "staged" | "shipped";

// The built artifact and where it stands. `previewHtml` is the full self-contained HTML of the built
// entry page, rendered inline in a sandboxed iframe (the artifact files ride the staged gate item, so
// no served URL is needed). `previewUrl` is an optional iframe src for a future served-preview leg;
// `screenshotUrl` is a static fallback when neither can render; `shippedUrl` is the real public URL
// once the founder has approved the deploy at the gate.
export type Microproduct = {
  id: string;
  name: string;
  state: MicroproductState;
  channelId?: string | null;
  previewHtml?: string | null;
  previewUrl?: string | null;
  screenshotUrl?: string | null;
  shippedUrl?: string | null;
  summary?: string | null;
  updatedAt?: string | null;
};

const STATE_LABEL: Record<MicroproductState, string> = {
  building: "Building",
  built: "Built · staged locally",
  staged: "Staged for your gate",
  shipped: "Shipped",
};

export function MicroproductFace({
  microproduct,
  selected = false,
  // Open the live preview large (a CanvasCard, a new tab) — optional.
  onOpenPreview,
}: {
  microproduct: Microproduct;
  selected?: boolean;
  onOpenPreview?: (mp: Microproduct) => void;
}) {
  const mp = microproduct;
  const building = mp.state === "building";
  const shipped = mp.state === "shipped";
  const staged = mp.state === "staged";

  // Color is semantic only: proven-green once shipped, the rationed gate amber while staged at the
  // wall, otherwise monochrome ink. Never decoration.
  const accent = shipped ? "var(--proven)" : staged ? "var(--gap)" : "var(--ink)";
  const accentSoft = shipped ? "var(--proven-soft)" : staged ? "var(--gap-soft)" : "var(--surface-2)";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={SPRING}
      aria-label={`Microproduct ${mp.name}`}
      style={{
        width: 268,
        display: "flex",
        flexDirection: "column",
        background: "var(--surface)",
        border: `1px solid ${selected ? accent : "var(--line-2)"}`,
        borderRadius: "var(--r-lg)",
        boxShadow: selected ? "var(--shadow-pop)" : "var(--shadow-card)",
        overflow: "hidden",
      }}
    >
      {/* Header — the object label and its real state, the way a Gate/Teammate card heads itself. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 11px",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div
          style={{
            flex: "0 0 auto",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            borderRadius: 7,
            background: accentSoft,
            color: accent,
          }}
        >
          <Monitor size={14} />
        </div>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-xs)",
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--muted)",
          }}
        >
          Microproduct
        </span>
        <span
          style={{
            marginLeft: "auto",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: "var(--text-xs)",
            fontWeight: 600,
            color: accent,
          }}
        >
          {building ? <LoaderCircle size={12} className="spin" /> : null}
          {shipped ? <Check size={12} /> : null}
          {staged ? <Lock size={11} /> : null}
          {STATE_LABEL[mp.state]}
        </span>
      </div>

      {/* The live-preview frame — the artifact itself, shown. An iframe of the built static page when
          we have one, a screenshot fallback otherwise, a quiet building shimmer while it's compiling. */}
      <button
        type="button"
        onClick={() => onOpenPreview?.(mp)}
        disabled={!onOpenPreview || building}
        title={onOpenPreview ? "Open the live preview" : undefined}
        style={{
          position: "relative",
          display: "block",
          width: "100%",
          height: 150,
          padding: 0,
          border: "none",
          borderBottom: "1px solid var(--line)",
          background: "var(--surface-2)",
          cursor: onOpenPreview && !building ? "zoom-in" : "default",
          overflow: "hidden",
        }}
      >
        {building ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              color: "var(--faint)",
            }}
          >
            <LoaderCircle size={18} className="spin" />
            <span style={{ fontSize: "var(--text-xs)" }}>Compiling the page…</span>
          </div>
        ) : mp.previewHtml || mp.previewUrl ? (
          // The built entry page, shown. Prefer the self-contained HTML rendered inline (srcDoc) since
          // the artifact files ride the staged item — no served URL needed; fall back to a served src
          // when a future serve leg supplies one. Pointer-events off so the card click (zoom) wins over
          // the framed page; sandboxed (no allow-scripts) and read-only — the preview never runs scripts
          // that could reach out, so it renders the page's HTML/CSS as a static thumbnail.
          <iframe
            title={`${mp.name} preview`}
            {...(mp.previewHtml ? { srcDoc: mp.previewHtml } : { src: mp.previewUrl ?? undefined })}
            sandbox=""
            loading="lazy"
            tabIndex={-1}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "200%",
              height: "300px",
              border: "none",
              transform: "scale(0.5)",
              transformOrigin: "top left",
              pointerEvents: "none",
              background: "var(--surface)",
            }}
          />
        ) : mp.screenshotUrl ? (
          <img
            src={mp.screenshotUrl}
            alt={`${mp.name} preview`}
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--faint)",
              fontSize: "var(--text-xs)",
            }}
          >
            No preview yet
          </div>
        )}
      </button>

      {/* Footer — the name, an optional one-line summary, and the gated ship affordance. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 11px 11px" }}>
        <span
          style={{
            fontSize: "var(--text-sm)",
            fontWeight: 600,
            color: "var(--ink)",
            letterSpacing: "-0.01em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {mp.name}
        </span>
        {mp.summary ? (
          <span style={{ fontSize: "var(--text-xs)", color: "var(--muted)", lineHeight: 1.45 }}>
            {mp.summary}
          </span>
        ) : null}

        {/* Staged — held at the wall. Honest about WHY there's no live URL: it waits on your approval.
            There is no ship button here on purpose — the deploy is a founder act performed at the gate. */}
        {staged ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "7px 11px",
              border: "1px solid var(--gap)",
              borderRadius: "var(--r-md)",
              background: "var(--gap-soft)",
              color: "var(--gap)",
              fontSize: "var(--text-xs)",
              fontWeight: 600,
              lineHeight: 1.4,
            }}
          >
            <Lock size={12} style={{ flex: "0 0 auto" }} />
            Waiting at your gate — approve there to deploy
          </span>
        ) : null}

        {/* Shipped — the proven end state, with the real public URL. */}
        {shipped && mp.shippedUrl ? (
          <a
            href={mp.shippedUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 11px",
              border: "1px solid var(--proven)",
              borderRadius: "var(--r-md)",
              background: "var(--proven-soft)",
              color: "var(--proven)",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            <ExternalLink size={13} />
            View live
          </a>
        ) : null}
      </div>
    </motion.div>
  );
}
