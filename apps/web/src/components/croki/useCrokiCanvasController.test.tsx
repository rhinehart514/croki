import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import { EnvironmentId, ProjectWriteFileError } from "@t3tools/contracts";
import { createEmptyCrokiContext, serializeCrokiContext } from "@t3tools/shared/crokiContext";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/unstable/reactivity";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  fileQuery: {
    data: null as null | {
      readonly contents: string;
      readonly truncated: boolean;
    },
    error: null as string | null,
    isPending: true,
  },
  refresh: vi.fn(),
  toast: vi.fn(),
  write:
    vi.fn<
      (input: unknown) => Promise<AtomCommandResult<{ readonly relativePath: string }, unknown>>
    >(),
}));

vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    useEffect: (effect: () => void | (() => void)) => {
      effect();
    },
  };
});
vi.mock("~/state/projects", () => ({
  projectEnvironment: { writeFile: {} },
}));
vi.mock("~/state/use-atom-command", () => ({
  useAtomCommand: () => mocks.write,
}));
vi.mock("../files/projectFilesQueryState", () => ({
  useProjectFileQuery: () => ({
    ...mocks.fileQuery,
    refresh: mocks.refresh,
  }),
}));
vi.mock("../ui/toast", () => ({
  stackedThreadToast: (toast: unknown) => toast,
  toastManager: { add: mocks.toast },
}));

import {
  acceptCrokiCanvasFile,
  acceptCrokiCanvasMissing,
  confirmCrokiCanvasRepair,
  getCrokiCanvasDraft,
  makeCrokiCanvasWorkspaceKey,
  replaceCrokiCanvasDraft,
  resetCrokiCanvasDraftStoreForTests,
} from "./crokiCanvasDraftStore";
import { replaceCrokiProduct } from "./crokiCanvasModel";
import { useCrokiCanvasController } from "./useCrokiCanvasController";

const ENVIRONMENT_ID = EnvironmentId.make("local");
const WORKSPACE_ROOT = "/work/croki";
const WORKSPACE_KEY = makeCrokiCanvasWorkspaceKey(ENVIRONMENT_ID, WORKSPACE_ROOT);

describe("useCrokiCanvasController save lifecycle", () => {
  beforeEach(() => {
    resetCrokiCanvasDraftStoreForTests();
    mocks.refresh.mockReset();
    mocks.toast.mockReset();
    mocks.write.mockReset();
    mocks.fileQuery.data = null;
    mocks.fileQuery.error = null;
    mocks.fileQuery.isPending = true;
  });

  it("saves against the exact baseline and clears pending state", async () => {
    const baseline = seedDirtyDraft();
    mocks.write.mockResolvedValue(AsyncResult.success({ relativePath: ".croki/context.json" }));
    const controller = renderController();

    controller.save();

    await vi.waitFor(() => expect(mocks.write).toHaveBeenCalledOnce());
    expect(mocks.write).toHaveBeenCalledWith({
      environmentId: ENVIRONMENT_ID,
      input: {
        cwd: WORKSPACE_ROOT,
        relativePath: ".croki/context.json",
        contents: expect.stringContaining('"product": "Croki Studio"'),
        expectedContentsSha256: await sha256(serializeCrokiContext(baseline)),
      },
    });
    await vi.waitFor(() => expect(getCrokiCanvasDraft(WORKSPACE_KEY).dirty).toBe(false));
    expect(getCrokiCanvasDraft(WORKSPACE_KEY).isSaving).toBe(false);
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Canvas saved" }));
  });

  it("keeps the draft and reports a stale-write conflict", async () => {
    seedDirtyDraft();
    mocks.write.mockResolvedValue(
      AsyncResult.failure(
        Cause.fail(
          new ProjectWriteFileError({
            cwd: WORKSPACE_ROOT,
            relativePath: ".croki/context.json",
            failure: "stale_write",
            expectedContentsSha256: "a".repeat(64),
            actualContentsSha256: "b".repeat(64),
          }),
        ),
      ),
    );
    const controller = renderController();

    controller.save();

    await vi.waitFor(() => expect(getCrokiCanvasDraft(WORKSPACE_KEY).isSaving).toBe(false));
    expect(getCrokiCanvasDraft(WORKSPACE_KEY).dirty).toBe(true);
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Canvas changed in the workspace" }),
    );
  });

  it("keeps the draft after a non-conflict write failure", async () => {
    seedDirtyDraft();
    mocks.write.mockResolvedValue(AsyncResult.failure(Cause.fail(new Error("disk unavailable"))));
    const controller = renderController();

    controller.save();

    await vi.waitFor(() => expect(getCrokiCanvasDraft(WORKSPACE_KEY).isSaving).toBe(false));
    expect(getCrokiCanvasDraft(WORKSPACE_KEY).dirty).toBe(true);
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Could not save Canvas",
        description: "disk unavailable",
      }),
    );
  });

  it("creates a missing Canvas with an absence precondition", async () => {
    acceptCrokiCanvasMissing(WORKSPACE_KEY, "Croki");
    replaceCrokiCanvasDraft(
      WORKSPACE_KEY,
      replaceCrokiProduct(
        createEmptyCrokiContext("Croki"),
        "Croki Studio",
        "2026-07-30T00:00:00.000Z",
      ),
    );
    mocks.write.mockResolvedValue(AsyncResult.success({ relativePath: ".croki/context.json" }));

    renderController().save();

    await vi.waitFor(() => expect(mocks.write).toHaveBeenCalledOnce());
    expect(mocks.write.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        input: expect.objectContaining({ expectedContentsSha256: null }),
      }),
    );
  });

  it("repairs only the exact malformed workspace copy", async () => {
    const malformed = "{not-json";
    acceptCrokiCanvasFile(WORKSPACE_KEY, malformed, "Croki");
    confirmCrokiCanvasRepair(WORKSPACE_KEY, "Croki");
    mocks.write.mockResolvedValue(AsyncResult.success({ relativePath: ".croki/context.json" }));

    renderController().save();

    await vi.waitFor(() => expect(mocks.write).toHaveBeenCalledOnce());
    expect(mocks.write.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        input: expect.objectContaining({
          expectedContentsSha256: await sha256(malformed),
        }),
      }),
    );
  });

  it("reports clean and pending draft state through the panel callback", () => {
    const cleanPending = vi.fn();
    renderController(cleanPending);
    expect(cleanPending).toHaveBeenCalledWith(false);

    seedDirtyDraft();
    const dirtyPending = vi.fn();
    renderController(dirtyPending);
    expect(dirtyPending).toHaveBeenCalledWith(true);
  });

  it("exposes session undo, redo, and discard controls", () => {
    seedDirtyDraft();
    let controller = renderController();
    expect(controller.canUndo).toBe(true);
    expect(controller.canRedo).toBe(false);

    controller.undo();
    expect(getCrokiCanvasDraft(WORKSPACE_KEY).context.product).toBe("Croki");
    expect(getCrokiCanvasDraft(WORKSPACE_KEY).dirty).toBe(false);

    controller = renderController();
    expect(controller.canUndo).toBe(false);
    expect(controller.canRedo).toBe(true);
    controller.redo();
    expect(getCrokiCanvasDraft(WORKSPACE_KEY).context.product).toBe("Croki Studio");

    controller = renderController();
    controller.discard();
    expect(getCrokiCanvasDraft(WORKSPACE_KEY).context.product).toBe("Croki");
    expect(getCrokiCanvasDraft(WORKSPACE_KEY).dirty).toBe(false);

    controller = renderController();
    expect(controller.canUndo).toBe(false);
    expect(controller.canRedo).toBe(false);
  });

  it.each([
    {
      expected: "valid",
      query: {
        data: {
          contents: serializeCrokiContext(createEmptyCrokiContext("Workspace Croki")),
          truncated: false,
        },
        error: null,
        isPending: false,
      },
    },
    {
      expected: "missing",
      query: { data: null, error: null, isPending: false },
    },
    {
      expected: "malformed",
      query: {
        data: { contents: "{nope", truncated: false },
        error: null,
        isPending: false,
      },
    },
    {
      expected: "read-error",
      query: {
        data: null,
        error: "Workspace disconnected.",
        isPending: false,
      },
    },
  ] as const)("loads the $expected workspace state", ({ expected, query }) => {
    Object.assign(mocks.fileQuery, query);
    renderController();
    expect(getCrokiCanvasDraft(WORKSPACE_KEY).sourceState).toBe(expected);
  });
});

function seedDirtyDraft() {
  const baseline = createEmptyCrokiContext("Croki");
  acceptCrokiCanvasFile(WORKSPACE_KEY, serializeCrokiContext(baseline), "Croki");
  replaceCrokiCanvasDraft(
    WORKSPACE_KEY,
    replaceCrokiProduct(baseline, "Croki Studio", "2026-07-30T00:00:00.000Z"),
  );
  return baseline;
}

function renderController(onPendingChange?: (pending: boolean) => void) {
  const capture: {
    current?: ReturnType<typeof useCrokiCanvasController>;
  } = {};
  function Harness() {
    capture.current = useCrokiCanvasController({
      environmentId: ENVIRONMENT_ID,
      productName: "Croki",
      workspaceRoot: WORKSPACE_ROOT,
      ...(onPendingChange ? { onPendingChange } : {}),
    });
    return null;
  }
  renderToStaticMarkup(<Harness />);
  if (!capture.current) throw new Error("Controller did not render.");
  return capture.current;
}

async function sha256(contents: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(contents));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
