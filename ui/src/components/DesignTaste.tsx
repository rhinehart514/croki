import { useCallback, useEffect, useState } from "react";
import { Check, Info, Link2, Palette, Plus, Trash2 } from "lucide-react";
import {
  addDesignReference, getDesignState, saveDesignState,
  type DesignState, type DesignReference,
} from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import "@/styles/design-taste.css";

// DesignTaste — the founder's front-end house style, made persistent. Until this surface existed, every
// visual agent fell back to the built-in "Warm Calm" default, and any reference screen the founder had
// in mind went nowhere. Here the founder names how they want front-end work to LOOK and FEEL, and flags
// real screens that anchor it — so the crew drafts toward the founder's taste instead of a stock seed.
//
// This is TASTE, not the gate: nothing here sends, publishes, or approves. It only shapes what a visual
// agent reads before it drafts. Plain-language throughout — the five dimensions read as questions, not
// engineering register.

// The five dimensions the store tracks, each as a plain-language prompt (never "IA", "component register").
const DIMENSIONS: { key: string; label: string; ask: string }[] = [
  { key: "visual", label: "The look", ask: "Color, type, spacing — how the surface should feel to the eye." },
  { key: "ia", label: "The structure", ask: "How a screen is organized — what it puts first, how it's laid out." },
  { key: "components", label: "The pieces", ask: "Buttons, cards, inputs — the register of the small parts." },
  { key: "motion", label: "The motion", ask: "How things move — settling and calm, or quick and sharp." },
  { key: "copy", label: "The words", ask: "The voice — plain and human, or precise and technical." },
];

export function DesignTaste() {
  const [state, setState] = useState<DesignState | null>(null);
  const [houseStyle, setHouseStyle] = useState("");
  const [feeling, setFeeling] = useState("");
  const [principles, setPrinciples] = useState<Record<string, string>>({});
  const [refLabel, setRefLabel] = useState("");
  const [refUrl, setRefUrl] = useState("");
  const [refProves, setRefProves] = useState("");
  const [refDims, setRefDims] = useState<string[]>(["visual"]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hydrate = useCallback((next: DesignState) => {
    setState(next);
    setHouseStyle(next.houseStyle);
    setFeeling(next.feeling);
    setPrinciples(
      Object.fromEntries(DIMENSIONS.map((d) => [d.key, next.dimensions[d.key]?.principle ?? ""])),
    );
  }, []);

  useEffect(() => {
    let live = true;
    getDesignState()
      .then(({ designState }) => { if (live) hydrate(designState); })
      .catch((err) => { if (live) setError(err instanceof Error ? err.message : String(err)); });
    return () => { live = false; };
  }, [hydrate]);

  const dirty = state != null && (
    houseStyle.trim() !== state.houseStyle
    || feeling.trim() !== state.feeling
    || DIMENSIONS.some((d) => (principles[d.key] ?? "").trim() !== (state.dimensions[d.key]?.principle ?? ""))
  );

  const save = useCallback(async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const { designState } = await saveDesignState({
        houseStyle: houseStyle.trim() || undefined,
        feeling: feeling.trim() || undefined,
        dimensions: Object.fromEntries(
          DIMENSIONS.map((d) => [d.key, { principle: principles[d.key] ?? "" }]),
        ),
        references: state?.references ?? [],
      });
      hydrate(designState);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [houseStyle, feeling, principles, state, hydrate]);

  const addRef = useCallback(async () => {
    const label = refLabel.trim();
    if (!label) { setError("Give the screen a name so you can recognize it later."); return; }
    setBusy(true);
    setError(null);
    try {
      const { designState } = await addDesignReference({
        label,
        url: refUrl.trim() || null,
        source: refUrl.trim() ? "url" : "mobbin",
        dimensions: refDims.length ? refDims : ["visual"],
        proves: refProves.trim(),
      });
      hydrate(designState);
      setRefLabel(""); setRefUrl(""); setRefProves(""); setRefDims(["visual"]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [refLabel, refUrl, refProves, refDims, hydrate]);

  const removeRef = useCallback(async (id: string) => {
    if (!state) return;
    setBusy(true);
    setError(null);
    try {
      const { designState } = await saveDesignState({
        houseStyle: state.houseStyle,
        feeling: state.feeling,
        dimensions: Object.fromEntries(
          DIMENSIONS.map((d) => [d.key, { principle: state.dimensions[d.key]?.principle ?? "" }]),
        ),
        references: state.references.filter((r) => r.id !== id),
      });
      hydrate(designState);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [state, hydrate]);

  const toggleRefDim = (key: string) =>
    setRefDims((d) => (d.includes(key) ? d.filter((k) => k !== key) : [...d, key]));

  const references: DesignReference[] = state?.references ?? [];

  return (
    <div className="cs dt">
      <div className="cs-eyebrow">Design taste</div>
      <h1 className="cs-title">How you want your front-end to look</h1>
      <p className="cs-sub">
        When your crew builds a screen, a landing page, or a visual, it starts from <b>your</b> taste —
        not a stock default. Name the feeling and flag a few real screens you love, and every visual your
        crew drafts leans your way. This only shapes what they draft; it never sends anything.
      </p>

      {/* The house style + one-line feeling — the headline of the whole taste. */}
      <div className="dt-headline">
        <label className="cs-add-lead" htmlFor="dt-house">In a word or two, the style</label>
        <div className="cs-field">
          <Palette />
          <Input
            id="dt-house"
            type="text"
            value={houseStyle}
            onChange={(e) => { setHouseStyle(e.target.value); setSaved(false); }}
            placeholder="Warm Calm"
            maxLength={80}
          />
        </div>
        <label className="cs-add-lead" htmlFor="dt-feeling">The feeling, in one line</label>
        <Textarea
          id="dt-feeling"
          className="dt-feeling"
          value={feeling}
          onChange={(e) => { setFeeling(e.target.value); setSaved(false); }}
          placeholder="calm — one thing at a time, in a warm room, every edge rounded"
          rows={2}
          maxLength={200}
        />
      </div>

      {/* The five dimensions, each a plain-language prompt with a "not yet anchored" honesty tag. */}
      <div className="dt-dims">
        {DIMENSIONS.map((d) => {
          const grounded = state?.dimensions[d.key]?.grounded;
          return (
            <div key={d.key} className="dt-dim">
              <div className="dt-dim-head">
                <span className="dt-dim-label">{d.label}</span>
                {grounded
                  ? <span className="dt-dim-tag grounded"><Check /> Anchored to a screen</span>
                  : <span className="dt-dim-tag">A principle, no screen yet</span>}
              </div>
              <div className="dt-dim-ask">{d.ask}</div>
              <Textarea
                className="dt-dim-input"
                value={principles[d.key] ?? ""}
                onChange={(e) => { setPrinciples((p) => ({ ...p, [d.key]: e.target.value })); setSaved(false); }}
                placeholder="Say how you want this to feel…"
                rows={2}
                maxLength={400}
              />
            </div>
          );
        })}
      </div>

      <Button
        variant="ghost"
        className="cs-btn primary dt-save"
        disabled={busy || !dirty}
        onClick={() => void save()}
        type="button"
      >
        {saved && !dirty ? <><Check size={14} /> Saved</> : busy ? "Saving…" : "Save your taste"}
      </Button>

      {/* Reference screens — the anchor. Flagging a real screen marks its dimensions "anchored". */}
      <div className="dt-refs">
        <div className="dt-refs-head">
          <span className="cs-add-lead" style={{ margin: 0 }}>Screens you love</span>
          <span className="dt-refs-count">{references.length} flagged</span>
        </div>
        <p className="dt-refs-sub">
          A real screen says more than words. Flag one — a live site, or one you found on Mobbin — and note
          what it gets right. Your crew pulls it up before it drafts.
        </p>

        {references.length > 0 ? (
          <ul className="dt-ref-list">
            {references.map((r) => (
              <li key={r.id} className="dt-ref">
                <div className="dt-ref-body">
                  <div className="dt-ref-top">
                    <span className="dt-ref-label">{r.label}</span>
                    {r.url
                      ? <a className="dt-ref-link" href={r.url} target="_blank" rel="noreferrer"><Link2 size={11} /> Open</a>
                      : <span className="dt-ref-src">Mobbin</span>}
                  </div>
                  {r.proves ? <div className="dt-ref-proves">{r.proves}</div> : null}
                  <div className="dt-ref-dims">
                    {r.dimensions.map((dim) => (
                      <span key={dim} className="dt-ref-dim">{DIMENSIONS.find((x) => x.key === dim)?.label ?? dim}</span>
                    ))}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  className="cs-btn danger sm"
                  onClick={() => void removeRef(r.id)}
                  type="button"
                  title="Remove this reference"
                >
                  <Trash2 size={12} />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="dt-ref-empty">No screens flagged yet — add the first one below.</p>
        )}

        <div className="dt-ref-add">
          <div className="cs-field">
            <Palette />
            <Input
              type="text"
              value={refLabel}
              onChange={(e) => setRefLabel(e.target.value)}
              placeholder="What's it called? (e.g. Komoot, Linear settings)"
              maxLength={80}
            />
          </div>
          <div className="cs-field">
            <Link2 />
            <Input
              type="url"
              value={refUrl}
              onChange={(e) => setRefUrl(e.target.value)}
              placeholder="Link (optional — leave blank if it's a Mobbin screen)"
            />
          </div>
          <div className="cs-field">
            <Info />
            <Input
              type="text"
              value={refProves}
              onChange={(e) => setRefProves(e.target.value)}
              placeholder="What does it get right? (optional)"
              maxLength={200}
            />
          </div>
          <div className="dt-ref-dimpick">
            {DIMENSIONS.map((d) => (
              <button
                key={d.key}
                type="button"
                className={`dt-dim-chip ${refDims.includes(d.key) ? "on" : ""}`}
                onClick={() => toggleRefDim(d.key)}
              >
                {d.label}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            className="cs-btn dt-ref-add-btn"
            disabled={busy || !refLabel.trim()}
            onClick={() => void addRef()}
            type="button"
          >
            <Plus size={14} /> Flag this screen
          </Button>
        </div>
      </div>

      {error && <div className="cs-error">{error}</div>}
    </div>
  );
}
