export type FirmTeammateSoul = {
  name?: string | null;
  [key: string]: unknown;
};

export type FirmCrewMember = {
  ref: string;
  summonedAt: string;
  soul: FirmTeammateSoul | null;
};

export type FirmOutcome = {
  type: "outcome";
  id: string;
  outcomeKind: string | null;
  from: string | null;
  body: string | null;
  source: string | null;
  channel: string | null;
  observedAt: string;
  joined: boolean;
  [key: string]: unknown;
};

export type FirmBetPosition = "live" | "at-wall" | "ended";

export type FirmBet = {
  id: string;
  ventureId: string;
  intent: string;
  forkedFrom: string | null;
  teammateRef: string | null;
  refs: Array<{ type: string | null; id: string }>;
  evidence: unknown[];
  staged: unknown[];
  joinKey: string;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
  endedBy: string | null;
  learning: string | null;
  events?: Array<{ type: string; detail?: string | null; at: string }>;
  position: FirmBetPosition;
  stagedCount: number;
  latestOutcome: FirmOutcome | null;
  [key: string]: unknown;
};

export type FirmWallSummary = {
  count: number;
  oldestParkedAt: string | null;
};

export type FirmPlacement = {
  positions: Record<string, { x: number; y: number }>;
  revision: number;
};

export type FirmLens = {
  ventureId: string;
  crew: FirmCrewMember[];
  bets: FirmBet[];
  wall: FirmWallSummary;
  placement: FirmPlacement;
};
