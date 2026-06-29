import { useEffect, useState } from "react";
import { Check, LoaderCircle, Plus, ShieldCheck, User, Users, X } from "lucide-react";
import { addTeamMember, createTeam, getMe, getTeamMembers } from "@/api";
import { getIdentity, setActingTeam, type ActingIdentity } from "@/lib/identity";
import type { Me, TeamMember, TeamRole } from "@/types";
import "@/styles/team-space.css";

// The team space — see who's on your team and their role, and switch between your personal space and
// a shared team. Local-first: a solo founder sees their personal team and nothing else changes. The
// chosen team is stamped onto requests, so the rest of the IDE (the approval queue's release wall,
// new operator runs) knows which space you're acting in.
//
// Roles read plainly: an OWNER or APPROVER can release a gate (send to the world); a MEMBER can
// build and queue but not release. The role badges here are the same authority the gate enforces.

const ROLE_LABEL: Record<TeamRole, string> = {
  owner: "Owner",
  approver: "Approver",
  member: "Member",
};

const ROLE_NOTE: Record<TeamRole, string> = {
  owner: "Builds, queues, and releases to the world.",
  approver: "Builds, queues, and releases to the world.",
  member: "Builds and queues. Cannot release a gate.",
};

export function TeamSpace({
  onClose,
  onTeamChange,
}: {
  onClose: () => void;
  // Tells App the acting space changed, so it can re-scope identity-stamped reads.
  onTeamChange: (identity: ActingIdentity) => void;
}) {
  const [me, setMe] = useState<Me | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [acting, setActing] = useState<ActingIdentity>(getIdentity());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lightweight inline forms — no modals. One open at a time.
  const [creating, setCreating] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [memberDraft, setMemberDraft] = useState<{ userId: string; name: string; email: string; role: TeamRole }>(
    { userId: "", name: "", email: "", role: "member" },
  );

  // The team space currently selected — null acting team means the personal team (first in the list).
  const personalTeamId = me?.teams[0]?.id ?? null;
  const selectedTeamId = acting.teamId ?? personalTeamId;
  const selectedTeam = me?.teams.find((t) => t.id === selectedTeamId) ?? null;

  const reload = () => {
    getMe().then(setMe).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };
  useEffect(() => { reload(); }, []);

  useEffect(() => {
    let live = true;
    if (!selectedTeamId) {
      // No team selected — clear members asynchronously so we don't setState in the effect body.
      Promise.resolve().then(() => { if (live) setMembers([]); });
      return () => { live = false; };
    }
    getTeamMembers(selectedTeamId)
      .then(({ members: m }) => { if (live) setMembers(m); })
      .catch(() => { if (live) setMembers([]); });
    return () => { live = false; };
  }, [selectedTeamId, me]);

  // Switch the acting space. A team that is your personal team resolves to "personal" (null) so a solo
  // founder's requests stay header-free; any other team is stamped explicitly.
  const switchSpace = (teamId: string) => {
    const next = setActingTeam(teamId === personalTeamId ? null : teamId);
    setActing(next);
    onTeamChange(next);
  };

  const submitCreate = async () => {
    const name = newTeamName.trim();
    if (!name || busy) return;
    setBusy(true); setError(null);
    try {
      const { team } = await createTeam({ name });
      setCreating(false); setNewTeamName("");
      reload();
      // Land in the newly-created team.
      const next = setActingTeam(team.id);
      setActing(next); onTeamChange(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const submitAddMember = async () => {
    if (!selectedTeamId) return;
    const userId = memberDraft.userId.trim();
    if (!userId || busy) return;
    setBusy(true); setError(null);
    try {
      const { members: m } = await addTeamMember(selectedTeamId, {
        userId,
        name: memberDraft.name.trim() || undefined,
        email: memberDraft.email.trim() || undefined,
        role: memberDraft.role,
      });
      setMembers(m);
      setAddingMember(false);
      setMemberDraft({ userId: "", name: "", email: "", role: "member" });
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const myUserId = me?.user.userId ?? acting.userId;

  return (
    <aside className="team-space" role="dialog" aria-label="Team space" aria-modal="false">
      <header className="team-space-head">
        <div className="team-space-head-title">
          <Users />
          <strong>Team</strong>
        </div>
        <button className="team-space-close" onClick={onClose} type="button" aria-label="Close team space">
          <X />
        </button>
      </header>

      <div className="team-space-body">
        {error ? <p className="team-space-error">{error}</p> : null}

        {/* ── Spaces — your personal space and any teams, switchable ── */}
        <section className="team-space-section">
          <div className="team-space-section-head">
            <span className="team-space-section-label">Spaces</span>
            <button
              className="team-space-add"
              type="button"
              onClick={() => { setCreating((v) => !v); setAddingMember(false); }}
            >
              <Plus size={13} /> New team
            </button>
          </div>

          {creating ? (
            <div className="team-space-form">
              <input
                className="team-space-input"
                placeholder="Team name"
                value={newTeamName}
                autoFocus
                disabled={busy}
                onChange={(e) => setNewTeamName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void submitCreate(); }}
              />
              <div className="team-space-form-actions">
                <button className="team-space-btn primary" type="button" disabled={!newTeamName.trim() || busy} onClick={() => void submitCreate()}>
                  {busy ? <LoaderCircle className="spin" size={13} /> : <Check size={13} />} Create
                </button>
                <button className="team-space-btn" type="button" onClick={() => { setCreating(false); setNewTeamName(""); }}>Cancel</button>
              </div>
            </div>
          ) : null}

          <div className="team-space-list">
            {(me?.teams ?? []).map((team) => {
              const isPersonal = team.id === personalTeamId;
              const selected = team.id === selectedTeamId;
              return (
                <button
                  key={team.id}
                  className={`team-space-row ${selected ? "selected" : ""}`}
                  type="button"
                  onClick={() => switchSpace(team.id)}
                  aria-pressed={selected}
                >
                  <span className="team-space-row-glyph">{isPersonal ? <User size={15} /> : <Users size={15} />}</span>
                  <span className="team-space-row-body">
                    <span className="team-space-row-name">{isPersonal ? "Personal space" : team.name}</span>
                    <span className="team-space-row-meta">
                      {ROLE_LABEL[team.role]} · {team.memberCount} member{team.memberCount === 1 ? "" : "s"}
                    </span>
                  </span>
                  {selected ? <Check className="team-space-row-check" size={15} /> : null}
                </button>
              );
            })}
            {!me ? <div className="team-space-loading"><LoaderCircle className="spin" size={15} /> Loading…</div> : null}
          </div>
        </section>

        {/* ── Members — who is who, and what they can do ── */}
        {selectedTeam ? (
          <section className="team-space-section">
            <div className="team-space-section-head">
              <span className="team-space-section-label">
                {selectedTeam.id === personalTeamId ? "You" : `${selectedTeam.name} · members`}
              </span>
              {selectedTeam.id !== personalTeamId ? (
                <button
                  className="team-space-add"
                  type="button"
                  onClick={() => { setAddingMember((v) => !v); setCreating(false); }}
                >
                  <Plus size={13} /> Add
                </button>
              ) : null}
            </div>

            {addingMember ? (
              <div className="team-space-form">
                <input className="team-space-input" placeholder="User id (required)" value={memberDraft.userId} autoFocus disabled={busy}
                  onChange={(e) => setMemberDraft((d) => ({ ...d, userId: e.target.value }))} />
                <input className="team-space-input" placeholder="Name" value={memberDraft.name} disabled={busy}
                  onChange={(e) => setMemberDraft((d) => ({ ...d, name: e.target.value }))} />
                <input className="team-space-input" placeholder="Email" value={memberDraft.email} disabled={busy}
                  onChange={(e) => setMemberDraft((d) => ({ ...d, email: e.target.value }))} />
                <div className="team-space-roles">
                  {(["owner", "approver", "member"] as TeamRole[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`team-space-role-pick ${memberDraft.role === r ? "active" : ""}`}
                      onClick={() => setMemberDraft((d) => ({ ...d, role: r }))}
                    >
                      {ROLE_LABEL[r]}
                    </button>
                  ))}
                </div>
                <div className="team-space-form-actions">
                  <button className="team-space-btn primary" type="button" disabled={!memberDraft.userId.trim() || busy} onClick={() => void submitAddMember()}>
                    {busy ? <LoaderCircle className="spin" size={13} /> : <Check size={13} />} Add member
                  </button>
                  <button className="team-space-btn" type="button" onClick={() => setAddingMember(false)}>Cancel</button>
                </div>
              </div>
            ) : null}

            <div className="team-space-members">
              {members.map((m) => {
                const canRelease = m.role === "owner" || m.role === "approver";
                return (
                  <div className={`team-space-member ${m.userId === myUserId ? "is-me" : ""}`} key={m.userId}>
                    <span className="team-space-member-avatar" aria-hidden>{(m.name || m.userId).slice(0, 1).toUpperCase()}</span>
                    <div className="team-space-member-body">
                      <div className="team-space-member-line">
                        <strong>{m.name || m.userId}</strong>
                        {m.userId === myUserId ? <span className="team-space-you">you</span> : null}
                      </div>
                      {m.email ? <span className="team-space-member-email">{m.email}</span> : null}
                      <span className="team-space-member-note">{ROLE_NOTE[m.role]}</span>
                    </div>
                    <span className={`team-space-role-badge role-${m.role}`} title={ROLE_NOTE[m.role]}>
                      {canRelease ? <ShieldCheck size={11} /> : null}
                      {ROLE_LABEL[m.role]}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </aside>
  );
}
