// A crew member's face. Every agent — however many there are — gets a distinct hand-drawn
// Notionists character (DiceBear, CC0), rendered as crisp SVG and seeded off the agent's ref so the
// same teammate always looks the same and two teammates never collide.
//
// This is the picture only. It carries no name label (callers pair it with the plain-English role from
// its soul supplies the visible name, so it stays aria-hidden and purely presentational.

import { useMemo } from "react";
import { createAvatar } from "@dicebear/core";
import { notionists } from "@dicebear/collection";
import "./CrewAvatar.css";

export type CrewAvatarProps = {
  agentRef: string;
  size?: number;
  state?: "idle" | "working";
};

export function CrewAvatar({ agentRef, size = 28, state = "idle" }: CrewAvatarProps) {
  // Deterministic: same ref → identical SVG, every time. Regenerated only when the ref or size changes.
  const svg = useMemo(
    () =>
      createAvatar(notionists, {
        seed: agentRef,
        size,
        backgroundColor: ["transparent"],
      }).toString(),
    [agentRef, size],
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
