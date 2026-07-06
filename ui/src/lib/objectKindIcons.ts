import {
  BadgeCheck, Box, Circle, Flame, Gem, Milestone, Play, Quote, Radio, Route, Tag, Target,
  Users, Wrench, Zap, type LucideIcon,
} from "lucide-react";

// Every object kind gets its own glyph, so a card reads as the THING it is at any zoom — the same map
// the palette row and the node it creates share, so a "Buyer" row and the buyer card it drops onto the
// canvas carry one glyph. Stays monochrome (the icon is currentColor); hue is reserved for the semantic
// roles only (gate amber, outcome green), never a rainbow per kind.
const KIND_ICON: Record<string, LucideIcon> = {
  buyer: Users,
  pain: Flame,
  job: Target,
  offer: Tag,
  value_prop: Gem,
  message: Quote,
  proof_point: BadgeCheck,
  trigger: Zap,
  channel: Radio,
  conversion_path: Route,
  workaround: Wrench,
  capability: Box,
  path: Milestone,
  run: Play,
};

export function kindIcon(type: string | null | undefined): LucideIcon {
  return (type && KIND_ICON[type]) || Circle;
}
