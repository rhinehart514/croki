import { Fragment, useRef, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import type { JsonValue } from "@/openCanvasTypes";

const MAX_TEXT = 20_000;
const MAX_COLLECTION = 50;
const MAX_FIELDS = 12;
const MAX_DEPTH = 4;
const MAX_STRUCTURED_NODES = 250;
const MAX_COMPARISON_ITEMS = 8;
const MAX_JOURNEY_STEPS = 50;
const MAX_DIFF_LINES = 500;
const MAX_VISUAL_ELEMENTS = 80;
type RenderBudget = { remaining: number };
type JsonRecord = { [key: string]: JsonValue };

function isRecord(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function displayKey(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
}

function safeHref(value: string): string | null {
  try {
    const url = new URL(value, window.location.origin);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? value : null;
  } catch {
    return null;
  }
}

function inlineMarkdown(value: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push(value.slice(cursor, index));
    const token = match[0];
    const key = `${index}:${token}`;
    if (token.startsWith("`")) {
      parts.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**")) {
      parts.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      const href = link ? safeHref(link[2].trim()) : null;
      parts.push(href
        ? <a key={key} href={href} target="_blank" rel="noreferrer">{link?.[1]}</a>
        : <Fragment key={key}>{link?.[1] ?? token}</Fragment>);
    }
    cursor = index + token.length;
  }
  if (cursor < value.length) parts.push(value.slice(cursor));
  return parts;
}

function MarkdownBody({ value }: { value: string }) {
  const source = value.slice(0, MAX_TEXT);
  const lines = source.split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }

    if (line.startsWith("```")) {
      const language = line.slice(3).trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push(<pre key={`code:${index}`}><code data-language={language || undefined}>{code.join("\n")}</code></pre>);
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const Heading = `h${Math.min(heading[1].length + 2, 6)}` as "h3" | "h4" | "h5" | "h6";
      blocks.push(<Heading key={`heading:${index}`}>{inlineMarkdown(heading[2])}</Heading>);
      index += 1;
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) items.push(lines[index++].replace(/^\s*[-*+]\s+/, ""));
      blocks.push(<ul key={`list:${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{inlineMarkdown(item)}</li>)}</ul>);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) items.push(lines[index++].replace(/^\s*\d+[.)]\s+/, ""));
      blocks.push(<ol key={`ordered:${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{inlineMarkdown(item)}</li>)}</ol>);
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={`quote:${index}`}>{inlineMarkdown(quote.join(" "))}</blockquote>);
      continue;
    }

    const paragraph: string[] = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^(#{1,6})\s+|^```|^\s*[-*+]\s+|^\s*\d+[.)]\s+|^>\s?/.test(lines[index])) {
      paragraph.push(lines[index++].trim());
    }
    blocks.push(<p key={`paragraph:${index}`}>{inlineMarkdown(paragraph.join(" "))}</p>);
  }

  return <div className="artifact-renderer-markdown">{blocks}</div>;
}

function compactValue(value: JsonValue): ReactNode {
  if (value === null) return <span className="artifact-renderer-empty">None</span>;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return Array.isArray(value) ? `${value.length} items` : `${Object.keys(value).length} fields`;
  return String(value);
}

function scalarText(value: JsonValue | undefined): string | null {
  if (value === undefined || value === null || typeof value === "object") return null;
  return typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
}

function recordArray(value: JsonValue, keys: string[]): JsonRecord[] | null {
  const candidate = Array.isArray(value)
    ? value
    : isRecord(value)
      ? keys.map((key) => value[key]).find(Array.isArray)
      : undefined;
  if (!candidate || !candidate.every(isRecord)) return null;
  return candidate;
}

type VisualElement = {
  label: string;
  kind: "region" | "heading" | "text" | "control" | "media";
  x: number;
  y: number;
  width: number;
  height: number;
};

function finiteNumber(value: JsonValue | undefined, fallback: number): number {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function visualModel(content: JsonValue): { title: string; ratio: number; elements: VisualElement[]; total: number } | null {
  if (!isRecord(content)) return null;
  const source = recordArray(content, ["elements", "regions", "sections", "nodes", "layers"]);
  if (!source?.length) return null;
  const frame = isRecord(content.frame) ? content.frame : content;
  const frameWidth = clamp(finiteNumber(frame.width, 1200), 1, 4096);
  const frameHeight = clamp(finiteNumber(frame.height, 800), 1, 4096);
  const visible = source.slice(0, MAX_VISUAL_ELEMENTS);
  const allowedKinds = new Set<VisualElement["kind"]>(["region", "heading", "text", "control", "media"]);
  const elements = visible.map((item, index) => {
    const rawKind = String(scalarText(item.type) ?? scalarText(item.kind) ?? "region").toLowerCase();
    const kind = allowedKinds.has(rawKind as VisualElement["kind"]) ? rawKind as VisualElement["kind"] : "region";
    const fallbackY = 5 + (index % 8) * 11.5;
    const x = clamp(finiteNumber(item.x ?? item.left, 5), 0, frameWidth);
    const y = clamp(finiteNumber(item.y ?? item.top, fallbackY), 0, frameHeight);
    const width = clamp(finiteNumber(item.width ?? item.w, frameWidth * 0.9), 1, frameWidth - x || 1);
    const height = clamp(finiteNumber(item.height ?? item.h, frameHeight * 0.09), 1, frameHeight - y || 1);
    const label = ["label", "title", "text", "name", "placeholder"]
      .map((key) => scalarText(item[key])).find(Boolean)?.slice(0, 240) ?? displayKey(kind) + " " + (index + 1);
    return {
      label,
      kind,
      x: (x / frameWidth) * 100,
      y: (y / frameHeight) * 100,
      width: (width / frameWidth) * 100,
      height: (height / frameHeight) * 100,
    };
  });
  const title = (scalarText(content.title) ?? scalarText(frame.title) ?? "Visual artifact").slice(0, 160);
  return { title, ratio: clamp(frameWidth / frameHeight, 0.5, 2.4), elements, total: source.length };
}

function spatialTarget(elements: VisualElement[], currentIndex: number, key: string): number | null {
  const current = elements[currentIndex];
  if (!current) return null;
  const cx = current.x + current.width / 2;
  const cy = current.y + current.height / 2;
  const horizontal = key === "ArrowLeft" || key === "ArrowRight";
  const positive = key === "ArrowRight" || key === "ArrowDown";
  let winner: { index: number; score: number } | null = null;
  for (const [index, candidate] of elements.entries()) {
    if (index === currentIndex) continue;
    const dx = candidate.x + candidate.width / 2 - cx;
    const dy = candidate.y + candidate.height / 2 - cy;
    const primary = horizontal ? dx : dy;
    if ((positive && primary <= 0) || (!positive && primary >= 0)) continue;
    const secondary = horizontal ? dy : dx;
    const score = Math.abs(primary) + Math.abs(secondary) * 1.5;
    if (!winner || score < winner.score) winner = { index, score };
  }
  return winner?.index ?? null;
}

function VisualPreview({ model }: { model: NonNullable<ReturnType<typeof visualModel>> }) {
  const previewRef = useRef<HTMLDivElement>(null);
  const move = (event: ReactKeyboardEvent<HTMLDivElement>, index: number) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    const target = spatialTarget(model.elements, index, event.key);
    if (target === null) return;
    event.preventDefault();
    previewRef.current?.querySelector<HTMLElement>("[data-visual-index=\"" + target + "\"]")?.focus();
  };
  return (
    <figure className="artifact-visual">
      <figcaption>{model.title}</figcaption>
      <p className="sr-only">Use the arrow keys to move between wireframe regions.</p>
      <div
        className="artifact-visual-frame"
        ref={previewRef}
        style={{ "--artifact-visual-ratio": model.ratio } as CSSProperties}
        role="group"
        aria-label={model.title + " wireframe"}
      >
        {model.elements.map((element, index) => (
          <div
            className={"artifact-visual-element artifact-visual-element--" + element.kind}
            data-visual-index={index}
            key={index}
            tabIndex={index === 0 ? 0 : -1}
            aria-label={displayKey(element.kind) + ": " + element.label}
            onKeyDown={(event) => move(event, index)}
            style={{ left: element.x + "%", top: element.y + "%", width: element.width + "%", height: element.height + "%" }}
          >
            <span>{element.label}</span>
          </div>
        ))}
      </div>
      {model.total > model.elements.length ? <p className="artifact-renderer-limit">Showing {model.elements.length} of {model.total} regions.</p> : null}
    </figure>
  );
}

function ComparisonView({ items }: { items: JsonRecord[] }) {
  const visible = items.slice(0, MAX_COMPARISON_ITEMS);
  const nameKeys = ["name", "title", "label", "option", "alternative"];
  const labelKey = nameKeys.find((key) => visible.some((item) => scalarText(item[key]))) ?? null;
  const fields = Array.from(new Set(visible.flatMap((item) => Object.keys(item))))
    .filter((key) => key !== labelKey && visible.some((item) => scalarText(item[key]) !== null))
    .slice(0, MAX_FIELDS);

  if (!fields.length) return null;
  return (
    <div className="artifact-comparison-scroll" tabIndex={0} aria-label="Scrollable comparison">
      <table className="artifact-comparison">
        <caption className="sr-only">Comparison of {visible.length} alternatives</caption>
        <thead>
          <tr>
            <th scope="col">Alternative</th>
            {fields.map((field) => <th key={field} scope="col">{displayKey(field)}</th>)}
          </tr>
        </thead>
        <tbody>
          {visible.map((item, index) => (
            <tr key={index}>
              <th scope="row">{(labelKey ? scalarText(item[labelKey]) : null) ?? `Option ${index + 1}`}</th>
              {fields.map((field) => <td key={field}>{scalarText(item[field]) ?? <span className="artifact-renderer-empty">Not specified</span>}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {items.length > visible.length ? <p className="artifact-renderer-limit">Showing {visible.length} of {items.length} alternatives.</p> : null}
    </div>
  );
}

function JourneyView({ steps }: { steps: JsonRecord[] }) {
  const visible = steps.slice(0, MAX_JOURNEY_STEPS);

  return (
    <ol className="artifact-journey" aria-label="Journey">
      {visible.map((step, index) => {
        const title = ["title", "name", "label", "step", "event", "stage"]
          .map((key) => scalarText(step[key])).find(Boolean) ?? `Step ${index + 1}`;
        const timing = ["date", "time", "when", "duration", "period"]
          .map((key) => scalarText(step[key])).find(Boolean);
        const status = scalarText(step.status);
        const detail = ["description", "detail", "summary", "outcome", "notes"]
          .map((key) => scalarText(step[key])).find(Boolean);
        return (
          <li key={index}>
            <span className="artifact-journey-marker" aria-hidden="true">{index + 1}</span>
            <div className="artifact-journey-body">
              <div className="artifact-journey-heading">
                <strong>{title}</strong>
                {timing ? <time>{timing}</time> : null}
              </div>
              {detail ? <p>{detail}</p> : null}
              {status ? <span className="artifact-journey-status">{status}</span> : null}
            </div>
          </li>
        );
      })}
      {steps.length > visible.length ? <li className="artifact-renderer-limit">Showing {visible.length} of {steps.length} steps.</li> : null}
    </ol>
  );
}

function diffSource(content: JsonValue): string | null {
  if (typeof content === "string") return content;
  if (!isRecord(content)) return null;
  for (const key of ["diff", "patch", "content", "unifiedDiff"]) {
    if (typeof content[key] === "string") return content[key];
  }
  return null;
}

function diffLineKind(line: string): "add" | "remove" | "hunk" | "meta" | "context" {
  if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff ") || line.startsWith("index ")) return "meta";
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "remove";
  return "context";
}

function CodeDiffView({ source }: { source: string }) {
  const allLines = source.slice(0, MAX_TEXT).split("\n");
  const lines = allLines.slice(0, MAX_DIFF_LINES);
  return (
    <div className="artifact-diff-scroll" tabIndex={0} aria-label="Scrollable code changes">
      <div className="artifact-diff" role="region" aria-label="Code changes">
        {lines.map((line, index) => (
          <div className={`artifact-diff-line artifact-diff-line--${diffLineKind(line)}`} key={index}>
            <span aria-hidden="true">{index + 1}</span>
            <code>{line || " "}</code>
          </div>
        ))}
      </div>
      {allLines.length > lines.length || source.length > MAX_TEXT ? <p className="artifact-renderer-limit">This preview shows the first {lines.length} lines. The complete change remains available in Edit.</p> : null}
    </div>
  );
}

function RecordTable({ rows, total }: { rows: Array<{ [key: string]: JsonValue }>; total: number }) {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(0, MAX_FIELDS);
  return (
    <div className="artifact-renderer-table-scroll" tabIndex={0} aria-label="Scrollable artifact table">
      <table>
        <thead><tr>{columns.map((column) => <th key={column} scope="col">{displayKey(column)}</th>)}</tr></thead>
        <tbody>{rows.map((row, rowIndex) => (
          <tr key={rowIndex}>{columns.map((column) => <td key={column}>{compactValue(row[column] ?? null)}</td>)}</tr>
        ))}</tbody>
      </table>
      {total > rows.length ? <p className="artifact-renderer-limit">Showing {rows.length} of {total} rows.</p> : null}
    </div>
  );
}

function renderStructuredValue(value: JsonValue, budget: RenderBudget, depth = 0): ReactNode {
  if (budget.remaining <= 0) return <span className="artifact-renderer-empty">More detail available in Edit</span>;
  budget.remaining -= 1;
  if (value === null || typeof value !== "object") return <span>{compactValue(value)}</span>;
  if (depth >= MAX_DEPTH) return <span className="artifact-renderer-empty">More detail available in Edit</span>;

  if (Array.isArray(value)) {
    const visible = value.slice(0, MAX_COLLECTION);
    if (visible.length > 0 && visible.every(isRecord)) return <RecordTable rows={visible} total={value.length} />;
    return (
      <div className="artifact-renderer-list">
        {visible.map((item, index) => <div className="artifact-renderer-list-row" key={index}><span>{index + 1}</span>{renderStructuredValue(item, budget, depth + 1)}</div>)}
        {value.length > visible.length ? <p className="artifact-renderer-limit">Showing {visible.length} of {value.length} items.</p> : null}
      </div>
    );
  }

  const keys = Object.keys(value);
  const entries = keys.slice(0, MAX_COLLECTION).map((key) => [key, value[key]] as const);
  return (
    <dl className="artifact-renderer-record">
      {entries.map(([key, item]) => <div key={key}><dt>{displayKey(key)}</dt><dd>{renderStructuredValue(item, budget, depth + 1)}</dd></div>)}
      {keys.length > entries.length ? <div><dt>More</dt><dd className="artifact-renderer-limit">{keys.length - entries.length} additional fields are available in Edit.</dd></div> : null}
    </dl>
  );
}

export function ArtifactContentRenderer({ content, contentType }: { content: JsonValue; contentType: string }) {
  const normalizedType = contentType.toLowerCase();
  const isComparison = /(?:comparison|compare|alternatives)/.test(normalizedType);
  const isJourney = /(?:journey|timeline|milestones?)/.test(normalizedType);
  const isDiff = /(?:diff|patch)/.test(normalizedType);
  const isVisual = /(?:wireframe|mockup|visual-preview|layout-preview|design-preview)/.test(normalizedType);
  const isMarkdown = typeof content === "string" && (normalizedType.includes("markdown") || normalizedType === "text/md");
  const isPlainText = typeof content === "string" && (normalizedType.startsWith("text/") || !normalizedType);
  const wasTruncated = typeof content === "string" && content.length > MAX_TEXT;
  const renderBudget = { remaining: MAX_STRUCTURED_NODES };
  const comparisonItems = isComparison ? recordArray(content, ["options", "alternatives", "comparisons", "items", "rows"]) : null;
  const journeySteps = isJourney ? recordArray(content, ["steps", "events", "milestones", "stages", "journey", "timeline"]) : null;
  const codeDiff = isDiff ? diffSource(content) : null;
  const visualModelValue = isVisual ? visualModel(content) : null;
  const comparison = comparisonItems?.length ? <ComparisonView items={comparisonItems} /> : null;
  const journey = journeySteps?.length ? <JourneyView steps={journeySteps} /> : null;
  const diff = codeDiff !== null ? <CodeDiffView source={codeDiff} /> : null;
  const visual = visualModelValue ? <VisualPreview model={visualModelValue} /> : null;
  const specialized = comparison || journey || diff || visual;
  const renderer = comparison ? "comparison" : journey ? "journey" : diff ? "diff" : visual ? "visual" : isMarkdown ? "markdown" : typeof content === "string" ? "text" : "structured";

  return (
    <section className="artifact-renderer" aria-label="Artifact content" data-renderer={renderer}>
      <div className="artifact-renderer-type">{contentType || "Unspecified content"}</div>
      {specialized ?? (isMarkdown ? <MarkdownBody value={content} />
        : isPlainText ? <div className="artifact-renderer-text">{content.slice(0, MAX_TEXT)}</div>
          : typeof content === "string" ? <pre className="artifact-renderer-source"><code>{content.slice(0, MAX_TEXT)}</code></pre>
            : renderStructuredValue(content, renderBudget))}
      {!specialized && wasTruncated ? <p className="artifact-renderer-limit">This preview shows the first {MAX_TEXT.toLocaleString()} characters. The complete source remains available in Edit.</p> : null}
    </section>
  );
}
