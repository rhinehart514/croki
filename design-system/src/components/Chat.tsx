import * as React from "react";
import { cn } from "../lib/cn";

/* ═══════════════════════════════════════════════════════════════════════════
   Chat — a glass AI-assistant panel.

   Composable by construction: `Chat` is the framed shell (header + scrollable
   body + composer slot), and the body is filled with small, typed building
   blocks — `ChatAttachment`, `ChatMessage`, `ChatToolCall`, `ChatDocRef`, and
   `ChatComposer` — rather than a hardcoded mock. Every visual comes from the
   `--st-*` glass tokens; icons are passed in as `ReactNode` props so the
   package keeps no icon dependency.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ─── Shell ──────────────────────────────────────────────────────────────── */

export interface ChatProps extends React.ComponentProps<"div"> {
  /** The frosted header row — typically a `ChatHeader`. */
  header?: React.ReactNode;
  /** The composer pinned to the bottom — typically a `ChatComposer`. */
  composer?: React.ReactNode;
  /**
   * The scrollable conversation. Pass `ChatMessage` / `ChatAttachment` / etc.
   * as children; they are laid out in a top-to-bottom column with a gap.
   */
  children?: React.ReactNode;
}

/**
 * The glass AI-assistant panel: a fixed-height frosted card with a header, a
 * scrollable conversation body, and a composer. Compose the body from the
 * exported message subcomponents.
 */
export function Chat({ header, composer, children, className, ...props }: ChatProps) {
  return (
    <div className={cn("gtm-chat", className)} {...props}>
      {header}
      <div className="gtm-chat__body">{children}</div>
      {composer}
    </div>
  );
}

/* ─── Header ─────────────────────────────────────────────────────────────── */

export interface ChatHeaderProps extends Omit<React.ComponentProps<"div">, "title"> {
  /** The assistant title (e.g. "Outreach assistant"). */
  title?: React.ReactNode;
  /** Leading icon buttons (panel toggle, new chat, …) — usually `ChatIconButton`s. */
  actions?: React.ReactNode;
}

/** The header rail: leading icon buttons followed by the assistant title. */
export function ChatHeader({ title, actions, className, ...props }: ChatHeaderProps) {
  return (
    <div className={cn("gtm-chat__header", className)} {...props}>
      {actions}
      {title != null ? <span className="gtm-chat__title">{title}</span> : null}
    </div>
  );
}

export interface ChatIconButtonProps extends React.ComponentProps<"button"> {
  /** The glyph to render, as a `ReactNode` (no icon dependency). */
  icon: React.ReactNode;
}

/** A square, transparent icon button used in the header and message actions. */
export function ChatIconButton({ icon, type = "button", className, ...props }: ChatIconButtonProps) {
  return (
    <button type={type} className={cn("gtm-chat__icon-btn", className)} {...props}>
      {icon}
    </button>
  );
}

/* ─── Attachment bubble ──────────────────────────────────────────────────── */

export interface ChatAttachmentProps extends React.ComponentProps<"div"> {
  /** The file name (e.g. "Northwind-account-research.pdf"). */
  name: React.ReactNode;
  /** A secondary line under the name (e.g. "PDF document"). */
  meta?: React.ReactNode;
  /** The file-type glyph shown in the leading badge. */
  icon?: React.ReactNode;
  /**
   * Tone of the file badge — drives its accent color. Defaults to `danger`
   * (the PDF-red treatment from the reference).
   */
  tone?: "danger" | "generate" | "source" | "neutral";
  /**
   * Optional preview body under the file row. Pass custom content, or omit to
   * render the default skeleton-line document preview.
   */
  preview?: React.ReactNode;
}

const ATTACHMENT_SKELETON: readonly number[] = [88, 100, 100, 70, 94];

/** A file-attachment bubble: a typed file badge, name + meta, and a preview. */
export function ChatAttachment({
  name,
  meta,
  icon,
  tone = "danger",
  preview,
  className,
  ...props
}: ChatAttachmentProps) {
  return (
    <div className={cn("gtm-chat__attach", className)} {...props}>
      <div className="gtm-chat__attach-row">
        <span className={cn("gtm-chat__file-badge", `gtm-chat__file-badge--${tone}`)}>{icon}</span>
        <div className="gtm-chat__attach-meta">
          <div className="gtm-chat__attach-name">{name}</div>
          {meta != null ? <div className="gtm-chat__attach-sub">{meta}</div> : null}
        </div>
      </div>
      {preview === undefined ? (
        <div className="gtm-chat__attach-preview" aria-hidden="true">
          <div className="gtm-chat__skel gtm-chat__skel--title" />
          {ATTACHMENT_SKELETON.map((w, i) => (
            <div key={i} className="gtm-chat__skel" style={{ width: `${w}%` }} />
          ))}
        </div>
      ) : (
        preview
      )}
    </div>
  );
}

/* ─── Messages ───────────────────────────────────────────────────────────── */

export interface ChatMessageProps extends React.ComponentProps<"div"> {
  /** Who is speaking — drives layout and styling. */
  role?: "user" | "assistant";
  /** The assistant avatar (e.g. a star glyph); ignored for `user` messages. */
  avatar?: React.ReactNode;
  /** Trailing actions under an assistant reply (copy, regenerate, …). */
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * A single turn. A `user` message renders as a full-width inset bubble; an
 * `assistant` message renders with an avatar and a left rail that can hold tool
 * chips, doc references, the reply text, and an actions row.
 */
export function ChatMessage({
  role = "assistant",
  avatar,
  actions,
  children,
  className,
  ...props
}: ChatMessageProps) {
  if (role === "user") {
    return (
      <div className={cn("gtm-chat__msg gtm-chat__msg--user", className)} {...props}>
        {children}
      </div>
    );
  }
  return (
    <div className={cn("gtm-chat__msg gtm-chat__msg--assistant", className)} {...props}>
      {avatar != null ? <span className="gtm-chat__avatar">{avatar}</span> : null}
      <div className="gtm-chat__msg-stack">
        {children}
        {actions != null ? <div className="gtm-chat__msg-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

/** The assistant's reply body — sets the readable line-height and ink tone. */
export function ChatReply({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("gtm-chat__reply", className)} {...props} />;
}

/* ─── Inline chips ───────────────────────────────────────────────────────── */

export interface ChatToolCallProps extends React.ComponentProps<"div"> {
  /** A leading glyph for the tool (e.g. a document icon). */
  icon?: React.ReactNode;
  /** A trailing glyph, typically a chevron for expanding the call. */
  trailing?: React.ReactNode;
  /** Accent tone of the leading glyph. Defaults to `danger`. */
  tone?: "danger" | "generate" | "source" | "neutral";
  children?: React.ReactNode;
}

/** A tool-call chip: "Read …" with a leading glyph and an expand chevron. */
export function ChatToolCall({
  icon,
  trailing,
  tone = "danger",
  children,
  className,
  ...props
}: ChatToolCallProps) {
  return (
    <div className={cn("gtm-chat__chip gtm-chat__chip--tool", className)} {...props}>
      {icon != null ? (
        <span className={cn("gtm-chat__chip-icon", `gtm-chat__chip-icon--${tone}`)}>{icon}</span>
      ) : null}
      <span className="gtm-chat__chip-label">{children}</span>
      {trailing != null ? <span className="gtm-chat__chip-trail">{trailing}</span> : null}
    </div>
  );
}

export interface ChatDocRefProps extends React.ComponentProps<"div"> {
  /** A leading glyph for the document. */
  icon?: React.ReactNode;
  /** Accent tone of the leading glyph. Defaults to `generate`. */
  tone?: "danger" | "generate" | "source" | "neutral";
  children?: React.ReactNode;
}

/** A document-reference chip: a titled, bordered pill the reply produced. */
export function ChatDocRef({
  icon,
  tone = "generate",
  children,
  className,
  ...props
}: ChatDocRefProps) {
  return (
    <div className={cn("gtm-chat__chip gtm-chat__chip--doc", className)} {...props}>
      {icon != null ? (
        <span className={cn("gtm-chat__chip-icon", `gtm-chat__chip-icon--${tone}`)}>{icon}</span>
      ) : null}
      <span className="gtm-chat__doc-title">{children}</span>
    </div>
  );
}

/* ─── Composer ───────────────────────────────────────────────────────────── */

export interface ChatPillProps extends React.ComponentProps<"button"> {
  /** A leading glyph for the pill. */
  icon?: React.ReactNode;
  /** A trailing glyph (e.g. a chevron on a selector pill). */
  trailing?: React.ReactNode;
  /**
   * Visual emphasis. `link` is the accent Canvas pill, `outline` is the neutral
   * model selector. Defaults to `outline`.
   */
  variant?: "link" | "outline";
  children?: React.ReactNode;
}

/** A rounded control-rail pill (the Canvas action, the model selector). */
export function ChatPill({
  icon,
  trailing,
  variant = "outline",
  type = "button",
  children,
  className,
  ...props
}: ChatPillProps) {
  return (
    <button
      type={type}
      className={cn("gtm-chat__pill", `gtm-chat__pill--${variant}`, className)}
      {...props}
    >
      {icon != null ? <span className="gtm-chat__pill-icon">{icon}</span> : null}
      {children}
      {trailing != null ? <span className="gtm-chat__pill-trail">{trailing}</span> : null}
    </button>
  );
}

export interface ChatComposerProps extends Omit<React.ComponentProps<"div">, "onSubmit"> {
  /**
   * The input. Pass a controlled `<textarea>` or, when omitted, a static
   * placeholder line is rendered (matching the reference's prompt hint).
   */
  input?: React.ReactNode;
  /** Placeholder shown when no `input` is supplied. */
  placeholder?: React.ReactNode;
  /** The "+" attach button glyph. */
  plusIcon?: React.ReactNode;
  /** The mic button glyph. */
  micIcon?: React.ReactNode;
  /** The send (ink pill) glyph. */
  sendIcon?: React.ReactNode;
  /** Called when the send pill is pressed. */
  onSend?: () => void;
  /** Whether sending is disabled (e.g. empty input). */
  sendDisabled?: boolean;
  /**
   * The control rail between the "+" button and the mic/send — typically a
   * `ChatPill` for Canvas and another for the model selector.
   */
  controls?: React.ReactNode;
}

/**
 * The composer: a glass field holding the input over a control rail (+ button,
 * caller-supplied pills, mic, and the ink send pill).
 */
export function ChatComposer({
  input,
  placeholder = "Ask anything",
  plusIcon,
  micIcon,
  sendIcon,
  onSend,
  sendDisabled = false,
  controls,
  className,
  ...props
}: ChatComposerProps) {
  return (
    <div className={cn("gtm-chat__composer", className)} {...props}>
      <div className="gtm-chat__field">
        {input ?? <div className="gtm-chat__placeholder">{placeholder}</div>}
        <div className="gtm-chat__rail">
          <button type="button" className="gtm-chat__plus" aria-label="Add attachment">
            {plusIcon}
          </button>
          {controls}
          <span className="gtm-chat__rail-spacer" />
          {micIcon != null ? (
            <button type="button" className="gtm-chat__mic" aria-label="Dictate">
              {micIcon}
            </button>
          ) : null}
          <button
            type="button"
            className="gtm-chat__send"
            aria-label="Send"
            onClick={onSend}
            disabled={sendDisabled}
          >
            {sendIcon}
          </button>
        </div>
      </div>
    </div>
  );
}
