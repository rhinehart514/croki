import * as React from "react";
import { cn } from "../lib/cn";

export interface MediaCardProps extends Omit<React.ComponentProps<"div">, "title"> {
  /**
   * The cover / thumbnail region.
   * - A string is treated as a CSS `background` value — a gradient
   *   (`"linear-gradient(135deg,#26262d,#0c0c0f)"`), a solid color (`"#f1f0ee"`),
   *   or an image (`"url(/cover.png) center/cover"`).
   * - A `ReactNode` is rendered as fully custom cover content.
   */
  cover?: React.ReactNode;
  /** Content layered on top of a string `cover` (a kicker, headline, skeleton). */
  coverContent?: React.ReactNode;
  /** The card title — clamped to a single line. */
  title?: React.ReactNode;
  /** The secondary meta line (e.g. "Edited 11 minutes ago"). */
  meta?: React.ReactNode;
  /**
   * The footer row of metadata atoms — chips, pills, an avatar.
   * Falls back to `children` when omitted, so atoms can be passed either way.
   */
  footer?: React.ReactNode;
}

/**
 * A vertical stone-surface card with a media cover region, a title, a meta line,
 * and a footer row of metadata atoms.
 *
 * @example
 * <MediaCard
 *   cover="linear-gradient(135deg,#26262d,#0c0c0f)"
 *   coverContent={<span>Customer context is everywhere.</span>}
 *   title="Announcing CRM Feature"
 *   meta="Edited 11 minutes ago"
 *   footer={<><Chip />, <Avatar />, <Pill /></>}
 * />
 */
export function MediaCard({
  cover,
  coverContent,
  title,
  meta,
  footer,
  className,
  children,
  ...props
}: MediaCardProps) {
  const footerAtoms = footer ?? children;
  // A string cover is a CSS `background` value; anything else is custom content.
  const coverIsBackground = typeof cover === "string";

  return (
    <div className={cn("gtm-media-card", className)} {...props}>
      {cover != null ? (
        <div
          className="gtm-media-card__cover"
          style={coverIsBackground ? { background: cover } : undefined}
        >
          {coverIsBackground ? coverContent : cover}
        </div>
      ) : null}
      <div className="gtm-media-card__body">
        {title != null ? (
          <div className="gtm-media-card__title">{title}</div>
        ) : null}
        {meta != null ? <div className="gtm-media-card__meta">{meta}</div> : null}
        {footerAtoms != null ? (
          <div className="gtm-media-card__footer">{footerAtoms}</div>
        ) : null}
      </div>
    </div>
  );
}
