// A crew member's face. Every agent — however many there are — gets a distinct hand-drawn
// Notionists character (DiceBear, CC0), rendered as crisp SVG and seeded off the agent's ref so the
// same agent always looks the same and two agents never collide. The character carries no color of its
// own (Notionists is pure black line-art); the family rides in as a soft tinted chip behind it, which
// keeps the one-accent-moves rule the design system holds.
//
// This is the picture only. It carries no name label (callers pair it with the plain-English role from
// agentPersona), so it stays aria-hidden and purely presentational.

import { useMemo } from "react";
import { createAvatar } from "@dicebear/core";
import { notionists } from "@dicebear/collection";
import { FAMILY_TINT, type AgentFamily } from "@/lib/agentPersona";
import "./CrewAvatar.css";

export type CrewAvatarProps = {
  agentRef: string;
  family: AgentFamily;
  size?: number;
  state?: "idle" | "working";
};

export function CrewAvatar({ agentRef, family, size = 28, state = "idle" }: CrewAvatarProps) {
  // Deterministic: same ref → identical SVG, every time. Regenerated only when the ref or size changes.
  const svg = useMemo(
    () =>
      createAvatar(notionists, {
        seed: agentRef,
        size,
        backgroundColor: ["transparent"], // the chip behind carries the family tint, not the avatar
      }).toString(),
    [agentRef, size],
  );

  const chipBg = FAMILY_TINT[family]?.bg ?? FAMILY_TINT.general.bg;

  return (
    <span
      className={`crew-avatar${state === "working" ? " crew-avatar--working" : ""}`}
      style={{ width: size, height: size, background: chipBg }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
