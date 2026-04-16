import { describe, expect, it } from "vite-plus/test";
import {
  TranscriptAdapterRegistry,
  createTranscriptAdapterRegistry,
} from "../../src/adapters/loader.js";

const buildSessionReference = (
  frontendId: FrontendId,
  sessionId: string,
): SessionReference => ({
  frontendId,
  sessionId,
  projectId: `/projects/${sessionId}`,
  projectPath: `/projects/${sessionId}`,
  projectName: sessionId,
  sourcePath: `/projects/${sessionId}/session.jsonl`,
});

const buildSessionBundle = (
  frontendId: FrontendId,
  sessionId: string,
): NormalizedSessionBundle => ({
  session: {
    frontendId,
    sessionId,
    projectId: `/projects/${sessionId}`,
    projectPath: `/projects/${sessionId}`,
    projectName: sessionId,
    sourcePath: `/projects/${sessionId}/session.jsonl`,
    startedAt: new Date("2026-04-16T10:00:00.000Z"),
    endedAt: new Date("2026-04-16T10:05:00.000Z"),
    events: [],
  },
  views: {
    messages: [],
    toolCalls: [],
    toolResults: [],
    interrupts: [],
  },
  summary: {
    userMessageCount: 0,
    assistantMessageCount: 0,
    toolCallCount: 0,
    toolErrorCount: 0,
    interruptCount: 0,
  },
});

class FakeCodexAdapter implements TranscriptAdapter {
  readonly frontendId = "codex";

  loadSession = async (
    session: SessionReference,
  ): Promise<NormalizedSessionBundle> =>
    buildSessionBundle(this.frontendId, session.sessionId);
}

class FakeClaudeAdapter implements TranscriptAdapter {
  readonly frontendId = "claude";

  loadSession = async (
    session: SessionReference,
  ): Promise<NormalizedSessionBundle> =>
    buildSessionBundle(this.frontendId, session.sessionId);
}

describe("TranscriptAdapterRegistry", () => {
  it("registers and lists adapters", () => {
    const registry = createTranscriptAdapterRegistry();
    const codexAdapter = new FakeCodexAdapter();
    const claudeAdapter = new FakeClaudeAdapter();

    registry.register(codexAdapter);
    registry.register(claudeAdapter);

    const adapterFrontendIds = registry
      .listAdapters()
      .map((adapter) => adapter.frontendId)
      .sort();

    expect(adapterFrontendIds).toEqual(["claude", "codex"]);
  });

  it("returns a registered adapter by frontend id", () => {
    const registry = new TranscriptAdapterRegistry();
    const codexAdapter = new FakeCodexAdapter();

    registry.register(codexAdapter);

    expect(registry.getAdapter("codex")).toBe(codexAdapter);
  });

  it("loads sessions through the matching adapter", async () => {
    const registry = createTranscriptAdapterRegistry();
    registry.register(new FakeCodexAdapter());

    const session = buildSessionReference("codex", "codex-session");
    const bundle = await registry.loadSession(session);

    expect(bundle.session.frontendId).toBe("codex");
    expect(bundle.session.sessionId).toBe("codex-session");
  });

  it("throws when no adapter is registered for the requested frontend", () => {
    const registry = createTranscriptAdapterRegistry();

    expect(() => registry.getAdapter("gemini")).toThrow(
      "No transcript adapter registered for frontend: gemini",
    );
  });
});
