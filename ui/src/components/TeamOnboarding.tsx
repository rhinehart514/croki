import { useState } from "react";
import { useMutation } from "convex/react";
import { ArrowRight, Boxes, Check, KeyRound, LoaderCircle, Users } from "lucide-react";
import { teamsApi, saveTeamIdentity, type TeamIdentity } from "@/lib/convex";
import "@/styles/onboarding.css";

// The first-run experience for the team layer — an IDE-feel "set up your workspace" flow. Shown only
// when a team's Convex deployment is configured (VITE_CONVEX_URL) and this person hasn't picked a team
// yet. Two beats: who you are, then create a team or join one with a code. On done it persists the
// identity locally and hands control back to the workspace.

function randomInviteCode(): string {
  // Readable, unambiguous join code (no 0/O/1/I). Generated client-side for create; the server stores it.
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  const buf = new Uint32Array(8);
  (globalThis.crypto ?? ({ getRandomValues: (a: Uint32Array) => a } as Crypto)).getRandomValues(buf);
  for (let i = 0; i < 8; i++) out += alphabet[buf[i] % alphabet.length];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

export function TeamOnboarding({
  initialIdentity,
  onDone,
}: {
  initialIdentity?: string;
  onDone: (identity: TeamIdentity) => void;
}) {
  const [step, setStep] = useState<"who" | "team">(initialIdentity ? "team" : "who");
  const [email, setEmail] = useState(initialIdentity ?? "");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"create" | "join">("create");
  const [teamName, setTeamName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createTeam = useMutation(teamsApi.create);
  const joinTeam = useMutation(teamsApi.joinByCode);

  const whoValid = email.trim().includes("@") && name.trim().length > 1;
  const teamValid = mode === "create" ? teamName.trim().length > 1 : code.trim().length >= 6;

  // The escape hatch: a solo founder must never be trapped at the door. The team layer is a thin
  // mirror over local-first state, so when the Convex deployment is unreachable (or the founder just
  // wants to work alone) we save a LOCAL identity and hand control straight to the workspace — no team
  // round-trip. Storage is not team-scoped, so a local teamId is the personal space the server already
  // resolves to by default. Surfaced both as a persistent skip and automatically when a team call fails.
  const continueSolo = () => {
    if (busy) return;
    const id: TeamIdentity = {
      identity: email.trim() || "founder@local",
      name: name.trim() || "Founder",
      teamId: "local",
      teamName: "Local workspace",
      role: "owner",
    };
    saveTeamIdentity(id);
    onDone(id);
  };

  const submit = async () => {
    if (busy || !teamValid) return;
    setBusy(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      if (mode === "create") {
        const res = (await createTeam({
          name: teamName.trim(),
          identity: email.trim(),
          displayName: name.trim(),
          inviteCode: randomInviteCode(),
          createdAt: now,
        })) as { teamId: string; slug: string };
        const id: TeamIdentity = {
          identity: email.trim(),
          name: name.trim(),
          teamId: res.teamId,
          teamName: teamName.trim(),
          role: "owner",
        };
        saveTeamIdentity(id);
        onDone(id);
      } else {
        const res = (await joinTeam({
          inviteCode: code.trim().toUpperCase(),
          identity: email.trim(),
          displayName: name.trim(),
          joinedAt: now,
        })) as { teamId: string; slug: string; name: string };
        const id: TeamIdentity = {
          identity: email.trim(),
          name: name.trim(),
          teamId: res.teamId,
          teamName: res.name,
          role: "builder",
        };
        saveTeamIdentity(id);
        onDone(id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="onb-shell">
      <div className="onb-grid" aria-hidden />
      <div className="onb-card" role="dialog" aria-label="Set up your team workspace">
        <div className="onb-brand">
          <span className="onb-brand-mark"><Boxes size={18} /></span>
          <span className="onb-brand-name">GTM IDE</span>
        </div>

        {step === "who" ? (
          <>
            <h1 className="onb-title">Set up your workspace</h1>
            <p className="onb-sub">
              GTM IDE is the IDE for go-to-market. Your team shares one set of channels, runs, and gate
              decisions — each of you drives Claude on your own machine.
            </p>
            <label className="onb-field">
              <span>Your name</span>
              <input
                className="onb-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jacob Rinehart"
                autoFocus
              />
            </label>
            <label className="onb-field">
              <span>Work email</span>
              <input
                className="onb-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                type="email"
                onKeyDown={(e) => { if (e.key === "Enter" && whoValid) setStep("team"); }}
              />
            </label>
            <button className="onb-primary" disabled={!whoValid} onClick={() => setStep("team")} type="button">
              Continue <ArrowRight size={16} />
            </button>
          </>
        ) : (
          <>
            <h1 className="onb-title">Create your team, or join one</h1>
            <p className="onb-sub">A team is the unit of shared GTM state. You can invite the rest later.</p>

            <div className="onb-toggle" role="tablist" aria-label="Create or join">
              <button
                role="tab"
                aria-selected={mode === "create"}
                className={mode === "create" ? "is-active" : ""}
                onClick={() => setMode("create")}
                type="button"
              >
                <Users size={15} /> Create a team
              </button>
              <button
                role="tab"
                aria-selected={mode === "join"}
                className={mode === "join" ? "is-active" : ""}
                onClick={() => setMode("join")}
                type="button"
              >
                <KeyRound size={15} /> Join with a code
              </button>
            </div>

            {mode === "create" ? (
              <label className="onb-field">
                <span>Team name</span>
                <input
                  className="onb-input"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="Acme GTM"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
                />
              </label>
            ) : (
              <label className="onb-field">
                <span>Invite code</span>
                <input
                  className="onb-input onb-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="ABCD-2345"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
                />
              </label>
            )}

            {error ? (
              <div className="onb-error-block">
                <p className="onb-error">{error}</p>
                <button className="onb-ghost" onClick={continueSolo} type="button">
                  Can't reach your team — work locally instead
                </button>
              </div>
            ) : null}

            <div className="onb-actions">
              <button className="onb-ghost" onClick={() => setStep("who")} type="button" disabled={busy}>
                Back
              </button>
              <button className="onb-primary" disabled={!teamValid || busy} onClick={() => void submit()} type="button">
                {busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}
                {mode === "create" ? "Create team" : "Join team"}
              </button>
            </div>
          </>
        )}

        <p className="onb-foot">
          Runs on your own Claude subscription · your code never leaves your machine
        </p>
        <button className="onb-skip" onClick={continueSolo} type="button" disabled={busy}>
          Skip — work locally on this machine
        </button>
      </div>
    </div>
  );
}
