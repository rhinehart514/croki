import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductChangeReview } from "./ProductChangeReview";

const api = vi.hoisted(() => ({ list: vi.fn(), discard: vi.fn(), stage: vi.fn(), review: vi.fn(), readiness: vi.fn(), apply: vi.fn() }));
vi.mock("@/api", () => ({ listProductChanges: api.list, discardProductChange: api.discard, stageProductChangeProposal: api.stage, reviewProductChange: api.review, getProductChangeReadiness: api.readiness, applyProductChange: api.apply }));
const change = { id:"receipt.md",projectId:"p1",status:"ready-for-review",title:"Add share control",provider:"codex",model:"gpt-test",branch:"dogfood/change",worktree:"/repo/.dogfood-worktrees/change",baseCommit:"abc",capturedAt:"2026-07-11",safety:"Local",verification:"No verification recorded. The restricted builder had no shell.",diff:"--- a/a.ts\n+++ b/a.ts\n-old\n+new",patchHash:"hash-one",truncated:false,reviewWorkspaceId:null,reviewRevisionId:null,reviewRevision:null };

describe("ProductChangeReview",()=>{
  beforeEach(()=>{ api.list.mockReset().mockResolvedValue({changes:[change]});api.discard.mockReset().mockResolvedValue({});api.stage.mockReset().mockResolvedValue({proposal:{workspaceId:"w1",revision:{id:"r1",status:"proposed",diff:change.diff,patchHash:change.patchHash}}});api.review.mockReset().mockResolvedValue({revision:{id:"r1",status:"approved",diff:change.diff,patchHash:change.patchHash}});api.readiness.mockReset().mockResolvedValue({readiness:{ready:true,reasons:[],sameBase:true,sourceStatus:""}});api.apply.mockReset().mockResolvedValue({revision:{id:"r1",status:"applied",diff:change.diff,patchHash:change.patchHash}});});
  it("keeps stage, founder review, and explicit-confirm local apply as three separate acts",async()=>{
    render(<ProductChangeReview projectId="p1"/>);fireEvent.click(await screen.findByRole("button",{name:/add share control/i}));expect(screen.getByLabelText("Uncommitted code difference")).toHaveTextContent("+new");
    fireEvent.click(screen.getByRole("button",{name:/stage exact diff for review/i}));await screen.findByRole("button",{name:/approve local patch/i});expect(api.review).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:/approve local patch/i}));await screen.findByRole("button",{name:/apply approved patch/i});expect(api.apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:/apply approved patch/i}));expect(screen.getByText(/does not commit, merge, push, or deploy/i)).toBeInTheDocument();expect(api.apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:/yes, apply locally/i}));await waitFor(()=>expect(api.apply).toHaveBeenCalledWith("p1","receipt.md"));expect(await screen.findByText("Applied locally")).toBeInTheDocument();
  });
  it("requires confirmation before discarding isolated work",async()=>{render(<ProductChangeReview projectId="p1"/>);fireEvent.click(await screen.findByRole("button",{name:/add share control/i}));fireEvent.click(screen.getByRole("button",{name:/discard local work/i}));expect(api.discard).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:/yes, discard/i}));await waitFor(()=>expect(api.discard).toHaveBeenCalledWith("p1","receipt.md"));});
  it("freezes the staged diff and refuses approval when the retained work has drifted",async()=>{
    api.list.mockResolvedValue({changes:[{...change,diff:"live changed diff",patchHash:"hash-two",reviewWorkspaceId:"w1",reviewRevisionId:"r1",reviewRevision:{id:"r1",status:"proposed",diff:change.diff,patchHash:"hash-one"}}]});
    render(<ProductChangeReview projectId="p1"/>);fireEvent.click(await screen.findByRole("button",{name:/add share control/i}));
    expect(screen.getByLabelText("Uncommitted code difference")).toHaveTextContent("+new");
    expect(screen.getByRole("alert")).toHaveTextContent(/changed after this review snapshot/i);
    expect(screen.queryByRole("button",{name:/approve local patch/i})).not.toBeInTheDocument();
    expect(screen.getByRole("button",{name:/stage current exact diff/i})).toBeInTheDocument();
  });
});
