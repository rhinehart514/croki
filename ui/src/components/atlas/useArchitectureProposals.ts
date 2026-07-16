import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  acceptArchitectureSystemProposal,
  decideArchitectureProposal,
  listArchitectureProposals,
} from "@/api";
import type {
  FirmArchitectureDocument,
  FirmArchitectureProposal,
  FirmArchitectureProposalDecision,
  FirmArchitectureProposalRecord,
  FirmArchitectureProposalDecisionResponse,
  FirmArchitectureProposalsResponse,
} from "@/types";
import { projectArchitectureProposal } from "./architectureProposalProjection";

const DEFAULT_POLL_MS = 1_500;

function isStructuralProposal(proposal: FirmArchitectureProposalRecord): proposal is FirmArchitectureProposal {
  return !("mode" in proposal && proposal.mode === "working-theory");
}

type UseArchitectureProposalsOptions = {
  readOnly?: boolean;
  baseArchitecture?: FirmArchitectureDocument | null;
  pollMs?: number;
};

function blockedDecisionMessage(block: "settled" | "stale" | "read-only") {
  if (block === "settled") return "This architecture proposal has already been decided.";
  if (block === "stale") return "This architecture proposal is based on an earlier venture revision.";
  return "Architecture proposals can be reviewed here, but this surface cannot decide them.";
}

export function useArchitectureProposals(
  ventureId: string,
  options: UseArchitectureProposalsOptions = {},
) {
  const [response, setResponse] = useState<FirmArchitectureProposalsResponse | null>(null);
  const [loadedVentureId, setLoadedVentureId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const responseRef = useRef<FirmArchitectureProposalsResponse | null>(null);
  const requestSequenceRef = useRef(0);
  const appliedSequenceRef = useRef(0);
  const reloadRef = useRef<() => void>(() => undefined);
  const readOnly = options.readOnly === true;
  const pollMs = Math.max(250, options.pollMs ?? DEFAULT_POLL_MS);

  useEffect(() => { responseRef.current = response; }, [response]);

  useEffect(() => {
    let stopped = false;
    let timer: number | null = null;
    let polling = false;

    responseRef.current = null;

    const schedule = () => { timer = window.setTimeout(poll, pollMs); };
    const poll = async () => {
      if (stopped || polling) return;
      polling = true;
      const sequence = ++requestSequenceRef.current;
      try {
        const next = await listArchitectureProposals(ventureId);
        if (stopped || sequence < appliedSequenceRef.current) return;
        appliedSequenceRef.current = sequence;
        responseRef.current = next;
        setLoadedVentureId(ventureId);
        setResponse(next);
        setError(null);
      } catch (cause) {
        if (!stopped) {
          setLoadedVentureId(ventureId);
          setResponse(responseRef.current);
          setError(cause instanceof Error ? cause.message : "Architecture proposals could not be opened.");
        }
      } finally {
        polling = false;
        if (!stopped) {
          setLoading(false);
          schedule();
        }
      }
    };

    reloadRef.current = () => {
      if (timer !== null) window.clearTimeout(timer);
      void poll();
    };
    void poll();

    return () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [pollMs, ventureId]);

  const activeResponse = loadedVentureId === ventureId ? response : null;
  const proposals = useMemo(() => {
    if (!activeResponse) return [];
    return activeResponse.proposals.filter(isStructuralProposal).map((proposal) => projectArchitectureProposal(
      proposal,
      activeResponse.revision,
      { readOnly, baseArchitecture: options.baseArchitecture ?? null },
    ));
  }, [activeResponse, options.baseArchitecture, readOnly]);

  const decide = useCallback(async (
    proposalId: string,
    decision: FirmArchitectureProposalDecision,
  ): Promise<FirmArchitectureProposalDecisionResponse> => {
    const current = responseRef.current;
    const proposal = current?.proposals.find((entry) => entry.id === proposalId);
    if (!current || !proposal) throw new Error(`No such architecture proposal: ${proposalId}`);
    if (!isStructuralProposal(proposal)) throw new Error("Working theories are corrected in the venture view, not decided as structure.");
    const view = projectArchitectureProposal(proposal, current.revision, { readOnly });
    if (view.decisionBlock) throw new Error(blockedDecisionMessage(view.decisionBlock));

    setDecidingId(proposalId);
    setError(null);
    const sequence = ++requestSequenceRef.current;
    try {
      const result = decision.decision === "accept" && view.requiresSystemAcceptance
        ? await acceptArchitectureSystemProposal(ventureId, proposalId, decision.reason)
        : await decideArchitectureProposal(ventureId, proposalId, decision);
      appliedSequenceRef.current = sequence;
      const next = {
        revision: result.revision,
        proposals: current.proposals.map((entry) => entry.id === proposalId ? result.proposal : entry),
      };
      responseRef.current = next;
      setLoadedVentureId(ventureId);
      setResponse(next);
      return result;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The architecture proposal could not be decided.";
      setError(message);
      throw cause;
    } finally {
      setDecidingId(null);
    }
  }, [readOnly, ventureId]);

  return {
    proposals,
    pending: proposals.filter((entry) => entry.pending),
    revision: activeResponse?.revision ?? null,
    loading: loadedVentureId === ventureId ? loading : true,
    error: loadedVentureId === ventureId ? error : null,
    decidingId,
    readOnly,
    reload: useCallback(() => reloadRef.current(), []),
    decide,
  };
}
