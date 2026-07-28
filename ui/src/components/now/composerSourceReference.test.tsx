import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { expandFileMentions } from "./composerFileMentions";
import { addComposerSourceReference } from "./composerSourceReference";
import { useComposerDraft } from "./useScopedDraft";

function DraftProbe({ scopeKey }: { scopeKey: string }) {
  const draft = useComposerDraft(scopeKey);
  return <div>
    <span data-testid="draft">{draft.draft}</span>
    <span data-testid="wire">{expandFileMentions(draft.draft, draft.fileMentions)}</span>
    <span data-testid="source">{draft.fileMentions[0]?.sourceRef ?? ""}</span>
  </div>;
}

describe("composer source references", () => {
  beforeEach(() => localStorage.clear());

  it("adds a compact exact-line mention to only the owning Thread draft and survives remount", () => {
    const first = render(<DraftProbe scopeKey="scope:one" />);
    act(() => addComposerSourceReference({
      scopeKey: "scope:other",
      path: "ui/src/ignored.ts",
      startLine: 1,
      endLine: 1,
      ref: "repository:ui/src/ignored.ts#L1-L1:digest",
    }));
    expect(screen.getByTestId("draft")).toHaveTextContent("");
    act(() => addComposerSourceReference({
      scopeKey: "scope:one",
      path: "ui/src/ThreadConversation.tsx",
      startLine: 200,
      endLine: 204,
      ref: "repository:ui/src/ThreadConversation.tsx#L200-L204:digest",
    }));
    expect(screen.getByTestId("draft")).toHaveTextContent("@ThreadConversation.tsx:L200–204");
    expect(screen.getByTestId("wire")).toHaveTextContent("ui/src/ThreadConversation.tsx#L200-L204");
    expect(screen.getByTestId("source")).toHaveTextContent("repository:ui/src/ThreadConversation.tsx#L200-L204:digest");
    first.unmount();

    render(<DraftProbe scopeKey="scope:one" />);
    expect(screen.getByTestId("draft")).toHaveTextContent("@ThreadConversation.tsx:L200–204");
  });

  it("one mounted Project scope cannot erase another scope while either unmounts", () => {
    const first = render(<DraftProbe scopeKey="project-a:thread-one" />);
    act(() => addComposerSourceReference({
      scopeKey: "project-a:thread-one",
      path: "ui/src/a.ts",
      startLine: 4,
      endLine: 4,
      ref: "repository:ui/src/a.ts#L4-L4:a",
    }));
    first.unmount();

    const second = render(<DraftProbe scopeKey="project-b:thread-one" />);
    act(() => addComposerSourceReference({
      scopeKey: "project-b:thread-one",
      path: "ui/src/b.ts",
      startLine: 8,
      endLine: 8,
      ref: "repository:ui/src/b.ts#L8-L8:b",
    }));
    second.unmount();

    render(<DraftProbe scopeKey="project-a:thread-one" />);
    expect(screen.getByTestId("draft")).toHaveTextContent("@a.ts:L4");
  });
});
