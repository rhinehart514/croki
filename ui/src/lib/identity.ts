// Who am I, and which space am I acting in. Local-first: with nothing signed in, every request
// resolves to the founder on the server (the default), and the personal team is auto-created. This
// module is the dogfooding founder's lightweight identity — it lets you stamp a different user on
// requests (to feel the role wall as a teammate would) and remembers the team space you're in.
//
// The server reads identity from request headers (x-gtm-user / x-gtm-user-name / x-gtm-user-email)
// and falls back to the founder. We stamp those headers on every API call from the chosen identity.

export const FOUNDER_USER_ID = "founder";

export type ActingIdentity = {
  userId: string;
  name: string;
  email: string | null;
  // The team space the founder is acting inside (null → their personal space, resolved server-side).
  teamId: string | null;
};

const KEY = "gtm-ide-acting-identity";

// The default: the founder, in their personal space. The server stamps the same when no headers ride.
const FOUNDER: ActingIdentity = { userId: FOUNDER_USER_ID, name: "Founder", email: null, teamId: null };

let current: ActingIdentity = load();

function load(): ActingIdentity {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...FOUNDER };
    const parsed = JSON.parse(raw) as Partial<ActingIdentity>;
    return {
      userId: parsed.userId || FOUNDER_USER_ID,
      name: parsed.name || "Founder",
      email: parsed.email ?? null,
      teamId: parsed.teamId ?? null,
    };
  } catch {
    return { ...FOUNDER };
  }
}

export function getIdentity(): ActingIdentity {
  return current;
}

export function setIdentity(next: ActingIdentity): ActingIdentity {
  current = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* best-effort */ }
  return current;
}

// Switch only the team space (keeps the acting user). null → personal space.
export function setActingTeam(teamId: string | null): ActingIdentity {
  return setIdentity({ ...current, teamId });
}

// The headers the server reads to resolve the acting user. Omitted entirely when acting as the
// founder with no email, so a solo founder's requests look exactly like the unauthenticated default.
export function identityHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (current.userId && current.userId !== FOUNDER_USER_ID) headers["x-gtm-user"] = current.userId;
  if (current.name && current.userId !== FOUNDER_USER_ID) headers["x-gtm-user-name"] = current.name;
  if (current.email) headers["x-gtm-user-email"] = current.email;
  return headers;
}
