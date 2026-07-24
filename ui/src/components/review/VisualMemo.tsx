import { Check, PencilLine } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { normalizeGeneratedDocument } from "./normalizeGeneratedDocument";
import type { ArtifactSectionFocus } from "./artifactSectionFocus";

type MemoBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "subheading"; text: string }
  | { kind: "label"; label: string; text: string }
  | { kind: "list"; ordered: boolean; items: string[] };

type MemoSection = { title: string; blocks: MemoBlock[] };

function inline(value: string): ReactNode {
  const pieces = value.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
  return pieces.map((piece, index) => {
    if (piece.startsWith("**") && piece.endsWith("**")) return <strong key={index}>{piece.slice(2, -2)}</strong>;
    if (piece.startsWith("`") && piece.endsWith("`")) return <code key={index}>{piece.slice(1, -1)}</code>;
    return <Fragment key={index}>{piece}</Fragment>;
  });
}

function appendList(blocks: MemoBlock[], ordered: boolean, item: string) {
  const last = blocks.at(-1);
  if (last?.kind === "list" && last.ordered === ordered) last.items.push(item);
  else blocks.push({ kind: "list", ordered, items: [item] });
}

function parseMemo(content: string, fallbackTitle?: string) {
  const lines = normalizeGeneratedDocument(content).split("\n");
  let title = "";
  const intro: MemoBlock[] = [];
  const sections: MemoSection[] = [];
  let current = intro;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const h1 = line.match(/^#\s+(.+)$/);
    if (h1) { title ||= h1[1]; continue; }
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      const section = { title: h2[1], blocks: [] as MemoBlock[] };
      sections.push(section);
      current = section.blocks;
      continue;
    }
    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) { current.push({ kind: "subheading", text: h3[1] }); continue; }
    const label = line.match(/^\*\*(.+?):\*\*\s*(.*)$/);
    if (label) { current.push({ kind: "label", label: label[1], text: label[2] }); continue; }
    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (ordered) { appendList(current, true, ordered[1]); continue; }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) { appendList(current, false, bullet[1]); continue; }
    current.push({ kind: "paragraph", text: line });
  }

  // A produced document that never named itself gets no invented headline. "Produced work" set at
  // hero weight above a single drafted sentence is a placeholder wearing the authority of a title,
  // and the review panel that opens this artifact has already named it. Its own first words lead
  // instead; the fallback survives only where the title is needed as data.
  return { title: title || fallbackTitle || null, intro, sections };
}

function Block({ block }: { block: MemoBlock }) {
  if (block.kind === "paragraph") return <p>{inline(block.text)}</p>;
  if (block.kind === "subheading") return <h3>{inline(block.text)}</h3>;
  if (block.kind === "label") return <aside className="review-visual-label" data-action={/first action|next action/i.test(block.label) ? "true" : undefined}><span>{block.label}</span><p>{inline(block.text)}</p></aside>;
  const List = block.ordered ? "ol" : "ul";
  return <List className="review-visual-list">{block.items.map((item, index) => <li key={`${index}:${item}`}><span>{block.ordered ? String(index + 1).padStart(2, "0") : "•"}</span><p>{inline(item)}</p></li>)}</List>;
}

export function VisualMemo({ content, title, artifactRef, artifactAt = null, focusedSectionId = null, onFocusSection }: {
  content: string;
  title?: string;
  artifactRef?: string;
  artifactAt?: string | null;
  focusedSectionId?: string | null;
  onFocusSection?: (focus: ArtifactSectionFocus) => void;
}) {
  const memo = parseMemo(content, title);
  const interactive = Boolean(artifactRef && onFocusSection);
  return (
    <article className="review-artifact review-visual-memo">
      <header className="review-visual-hero" data-untitled={memo.title ? undefined : "true"}>
        <span>Product / GTM artifact</span>
        {memo.title ? <h1>{memo.title}</h1> : null}
        {memo.intro.length ? <div>{memo.intro.map((block, index) => <Block key={index} block={block} />)}</div> : null}
      </header>
      <div className="review-visual-sections">
        {memo.sections.map((section, index) => {
          const sectionId = `${index}:${section.title}`;
          const selected = focusedSectionId === sectionId;
          const focus = () => {
            if (!artifactRef || !onFocusSection) return;
            onFocusSection({ artifactRef, artifactTitle: memo.title ?? "Produced work", artifactAt, sectionId, sectionTitle: section.title, sectionIndex: index });
          };
          return (
          <section key={sectionId} data-featured={index === 0 ? "true" : undefined} data-steerable={interactive ? "true" : undefined} data-selected={selected ? "true" : undefined} onClick={interactive ? focus : undefined}>
            <header>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h2>{section.title}</h2>
              {interactive ? <button type="button" className="review-visual-steer" aria-label={`${selected ? "Editing" : "Revise"} ${section.title}`} aria-pressed={selected} onClick={(event) => { event.stopPropagation(); focus(); }}>{selected ? <Check aria-hidden="true" /> : <PencilLine aria-hidden="true" />}<span>{selected ? "Editing" : "Revise"}</span></button> : null}
            </header>
            <div>{section.blocks.map((block, blockIndex) => <Block key={blockIndex} block={block} />)}</div>
          </section>
          );
        })}
      </div>
    </article>
  );
}
