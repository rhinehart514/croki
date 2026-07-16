// A crew member's face. Every agent — however many there are — gets a distinct hand-drawn
// Notionists character (DiceBear, CC0), rendered as crisp SVG and seeded off the agent's ref so the
// same teammate always looks the same and two teammates never collide.
//
// This is the picture only. It carries no name label (callers pair it with the plain-English role from
// its soul supplies the visible name, so it stays aria-hidden and purely presentational.

import { useId, useMemo } from "react";
import { createAvatar } from "@dicebear/core";
import { notionists } from "@dicebear/collection";
import "./CrewAvatar.css";

export type CrewAvatarProps = {
  agentRef: string;
  size?: number;
  state?: "idle" | "working";
};

function prefixSvgIds(svg: string, prefix: string) {
  const ids = new Map<string, string>();
  const localId = (id: string) => {
    const existing = ids.get(id);
    if (existing) return existing;
    const next = `${prefix}--${id}`;
    ids.set(id, next);
    return next;
  };
  return svg
    .replace(/<metadata\b[^>]*>[\s\S]*?<\/metadata>/i, "")
    .replace(/id="([a-z0-9_.:-]+)"/gi, (_match, id: string) => `id="${localId(id)}"`)
    .replace(/url\(#([a-z0-9_.:-]+)\)/gi, (_match, id: string) => `url(#${localId(id)})`)
    .replace(/(?:xlink:)?href="#([a-z0-9_.:-]+)"/gi, (match, id: string) => {
      const attribute = match.slice(0, match.indexOf("="));
      return `${attribute}="#${localId(id)}"`;
    });
}

export function CrewAvatar({ agentRef, size = 28, state = "idle" }: CrewAvatarProps) {
  const reactId = useId();
  const svgPrefix = `crew-avatar-${reactId.replace(/[^a-z0-9_-]/gi, "") || "instance"}`;
  // Deterministic: same ref → identical SVG, every time. Regenerated only when the ref or size changes.
  const svg = useMemo(
    () => prefixSvgIds(
      createAvatar(notionists, {
        seed: agentRef,
        size,
        backgroundColor: ["transparent"],
      }).toString(),
      svgPrefix,
    ),
    [agentRef, size, svgPrefix],
  );

  return (
    <span
      className={`crew-avatar${state === "working" ? " crew-avatar--working" : ""}`}
      style={{ width: size, height: size, background: "var(--surface-2)" }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
