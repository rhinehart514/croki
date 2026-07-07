// Tiny in-memory accounts layer. A real app would hit a database here; for the
// sample it just mints ids so the signup flow reads end to end.
import { randomUUID } from "node:crypto";

export type User = { id: string; email: string; createdAt: string };
export type Workspace = {
  id: string;
  name: string;
  ownerId: string;
  plan: string;
  seats: number;
  createdAt: string;
};

const SEATS_BY_PLAN: Record<string, number> = { solo: 1, team: 5, business: 25 };

export async function createUser(input: { email: string }): Promise<User> {
  return {
    id: `usr_${randomUUID().slice(0, 8)}`,
    email: input.email,
    createdAt: new Date().toISOString(),
  };
}

export async function createWorkspace(input: {
  name: string;
  ownerId: string;
  plan: string;
}): Promise<Workspace> {
  return {
    id: `ws_${randomUUID().slice(0, 8)}`,
    name: input.name,
    ownerId: input.ownerId,
    plan: input.plan,
    seats: SEATS_BY_PLAN[input.plan] ?? 5,
    createdAt: new Date().toISOString(),
  };
}
