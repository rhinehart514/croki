import { createElement, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShellStateProvider } from "../state/ShellStateContext";
import { useShellState } from "../state/shellState";
import { useDescent } from "./useDescent";
import { targetBet } from "@/components/firm/directionTarget";
import type { AtlasNode } from "@/components/atlas/atlasTypes";

// Phase 2 acceptance (architecture §4): useDescent pushes/pops the descent path. A rung carries the
// composer scope, the world node id, and the node snapshot the reading renders; rising past the last
// rung broadens the camera back to the prior frame. Camera verbs are registered by the world; here we
// register a fake to assert the fly-in / rise wiring without a live ReactFlow instance.
function node(id: string): AtlasNode {
  return { id, position: { x: 0, y: 0 }, data: { kind: "bet", title: id } } as unknown as AtlasNode;
}

const wrapper = ({ children }: { children: ReactNode }) => createElement(ShellStateProvider, null, children);

function harness() {
  return renderHook(() => ({ descent: useDescent(), shell: useShellState() }), { wrapper });
}

describe("useDescent", () => {
  it("pushes a rung onto the path and sets the composer scope", () => {
    const { result } = harness();
    expect(result.current.descent.descentOpen).toBe(false);

    act(() => result.current.descent.descend(targetBet("b1"), "bet:b1", node("bet:b1")));

    expect(result.current.descent.descentOpen).toBe(true);
    expect(result.current.descent.descentPath).toHaveLength(1);
    expect(result.current.descent.current?.nodeId).toBe("bet:b1");
    expect(result.current.shell.selection?.betId).toBe("b1");
  });

  it("pops the last rung on rise and restores the prior selection", () => {
    const { result } = harness();
    act(() => result.current.descent.descend(targetBet("b1"), "bet:b1", node("bet:b1")));
    act(() => result.current.descent.descend(targetBet("b2"), "bet:b2", node("bet:b2")));
    expect(result.current.descent.descentPath).toHaveLength(2);

    act(() => result.current.descent.rise());
    expect(result.current.descent.descentPath).toHaveLength(1);
    expect(result.current.shell.selection?.betId).toBe("b1");

    act(() => result.current.descent.rise());
    expect(result.current.descent.descentOpen).toBe(false);
    expect(result.current.shell.selection).toBeNull();
  });

  it("flies the camera to the node on descend and broadens back at the root", () => {
    const { result } = harness();
    const reveal = vi.fn();
    const broaden = vi.fn();
    act(() => result.current.shell.registerCamera({ reveal, broaden }));

    act(() => result.current.descent.descend(targetBet("b1"), "bet:b1", node("bet:b1")));
    expect(reveal).toHaveBeenCalledWith("bet:b1");

    act(() => result.current.descent.rise());
    expect(broaden).toHaveBeenCalledTimes(1);
  });

  it("riseToRoot clears the whole path and broadens", () => {
    const { result } = harness();
    const broaden = vi.fn();
    act(() => result.current.shell.registerCamera({ reveal: vi.fn(), broaden }));
    act(() => result.current.descent.descend(targetBet("b1"), "bet:b1", node("bet:b1")));
    act(() => result.current.descent.descend(targetBet("b2"), "bet:b2", node("bet:b2")));

    act(() => result.current.descent.riseToRoot());
    expect(result.current.descent.descentOpen).toBe(false);
    expect(broaden).toHaveBeenCalled();
  });
});
