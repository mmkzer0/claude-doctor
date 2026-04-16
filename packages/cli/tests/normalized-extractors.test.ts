import { describe, expect, it } from "vite-plus/test";
import {
  buildNormalizedSessionSummary,
  buildNormalizedSessionViews,
  countNormalizedInterrupts,
  countNormalizedToolErrors,
  extractNormalizedToolUses,
  extractNormalizedUserMessages,
  getNormalizedSessionTimeRange,
} from "../src/normalized.js";

const sampleEvents = (): NormalizedEvent[] => [
  {
    id: "meta-1",
    sessionId: "sample-session",
    timestamp: new Date("2026-04-01T10:00:00.000Z"),
    kind: "meta",
    isMeta: true,
    rawType: "queue-operation",
    pathHints: [],
  },
  {
    id: "user-1",
    sessionId: "sample-session",
    timestamp: new Date("2026-04-01T10:00:01.000Z"),
    kind: "user-message",
    role: "user",
    text: "fix the auth flow",
    parentId: null,
    isMeta: false,
    rawType: "user",
    pathHints: [],
  },
  {
    id: "assistant-reasoning-1",
    sessionId: "sample-session",
    timestamp: new Date("2026-04-01T10:00:02.000Z"),
    kind: "assistant-reasoning",
    role: "assistant",
    text: "I should inspect the auth module first.",
    parentId: "user-1",
    isMeta: false,
    rawType: "assistant",
    pathHints: [],
  },
  {
    id: "tool-call-1",
    sessionId: "sample-session",
    timestamp: new Date("2026-04-01T10:00:03.000Z"),
    kind: "tool-call",
    role: "assistant",
    parentId: "user-1",
    isMeta: false,
    rawType: "assistant",
    pathHints: ["src/auth.ts"],
    toolCall: {
      id: "tool-1",
      name: "Read",
      arguments: {
        file_path: "src/auth.ts",
      },
    },
  },
  {
    id: "tool-result-1",
    sessionId: "sample-session",
    timestamp: new Date("2026-04-01T10:00:04.000Z"),
    kind: "tool-result",
    role: "user",
    parentId: "tool-call-1",
    isMeta: false,
    rawType: "user",
    pathHints: [],
    toolResult: {
      toolCallId: "tool-1",
      outputText: "export const auth = true;",
      isError: false,
    },
  },
  {
    id: "assistant-message-1",
    sessionId: "sample-session",
    timestamp: new Date("2026-04-01T10:00:05.000Z"),
    kind: "assistant-message",
    role: "assistant",
    text: "I found the auth module.",
    parentId: "tool-result-1",
    isMeta: false,
    rawType: "assistant",
    pathHints: [],
  },
  {
    id: "interrupt-1",
    sessionId: "sample-session",
    timestamp: new Date("2026-04-01T10:00:06.000Z"),
    kind: "interrupt",
    role: "user",
    text: "[Request interrupted by user for tool use]",
    parentId: "assistant-message-1",
    isMeta: false,
    rawType: "user",
    pathHints: [],
  },
  {
    id: "tool-result-2",
    sessionId: "sample-session",
    timestamp: new Date("2026-04-01T10:00:07.000Z"),
    kind: "tool-result",
    role: "user",
    parentId: "assistant-message-1",
    isMeta: false,
    rawType: "user",
    pathHints: [],
    toolResult: {
      toolCallId: "tool-2",
      outputText: "<tool_use_error>Stream closed</tool_use_error>",
      isError: true,
    },
  },
];

describe("normalized extractors", () => {
  it("extracts normalized user messages while excluding meta events", () => {
    expect(extractNormalizedUserMessages(sampleEvents())).toEqual([
      "fix the auth flow",
      "[Request interrupted by user for tool use]",
    ]);
  });

  it("extracts normalized tool uses", () => {
    expect(extractNormalizedToolUses(sampleEvents())).toEqual([
      {
        id: "tool-1",
        name: "Read",
        input: {
          file_path: "src/auth.ts",
        },
      },
    ]);
  });

  it("counts normalized tool errors", () => {
    expect(countNormalizedToolErrors(sampleEvents())).toBe(1);
  });

  it("counts normalized interrupts", () => {
    expect(countNormalizedInterrupts(sampleEvents())).toBe(1);
  });

  it("derives a normalized session time range", () => {
    const sessionTimeRange = getNormalizedSessionTimeRange(sampleEvents());

    expect(sessionTimeRange.start.toISOString()).toBe(
      "2026-04-01T10:00:00.000Z",
    );
    expect(sessionTimeRange.end.toISOString()).toBe(
      "2026-04-01T10:00:07.000Z",
    );
  });

  it("builds normalized views", () => {
    const sessionViews = buildNormalizedSessionViews(sampleEvents());

    expect(sessionViews.messages.length).toBe(4);
    expect(sessionViews.toolCalls.length).toBe(1);
    expect(sessionViews.toolResults.length).toBe(2);
    expect(sessionViews.interrupts.length).toBe(1);
  });

  it("builds a normalized summary", () => {
    expect(buildNormalizedSessionSummary(sampleEvents())).toEqual({
      userMessageCount: 2,
      assistantMessageCount: 1,
      toolCallCount: 1,
      toolErrorCount: 1,
      interruptCount: 1,
    });
  });
});
