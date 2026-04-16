import * as path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import {
  countInterrupts,
  extractToolErrors,
  extractToolUses,
  extractUserMessages,
  getSessionTimeRange,
  parseTranscriptFile,
} from "../../src/parser.js";
import {
  ClaudeAdapter,
  createClaudeSessionReference,
} from "../../src/adapters/claude.js";
import {
  countNormalizedInterrupts,
  countNormalizedToolErrors,
  extractNormalizedToolUses,
  extractNormalizedUserMessages,
  getNormalizedSessionTimeRange,
} from "../../src/normalized.js";

const fixture = (name: string) =>
  path.join(import.meta.dirname, "..", "fixtures", name);

const loadBundle = async (name: string): Promise<NormalizedSessionBundle> => {
  const adapter = new ClaudeAdapter();
  return adapter.loadSession(createClaudeSessionReference(fixture(name)));
};

const allFixtures = [
  "correction-heavy-session.jsonl",
  "drift-session.jsonl",
  "error-loop-session.jsonl",
  "exploration-heavy-session.jsonl",
  "frustrated-session.jsonl",
  "happy-session.jsonl",
  "keep-going-session.jsonl",
  "meta-only-session.jsonl",
  "rapid-correction-session.jsonl",
  "thrashing-session.jsonl",
];

describe("ClaudeAdapter", () => {
  describe("contract", () => {
    it("returns a normalized session bundle with session, views, and summary", async () => {
      const bundle = await loadBundle("happy-session.jsonl");

      expect(bundle).toHaveProperty("session");
      expect(bundle).toHaveProperty("views");
      expect(bundle).toHaveProperty("summary");
      expect(bundle.session.frontendId).toBe("claude");
      expect(bundle.session.sessionId).toBe("happy-session");
      expect(bundle.session.sourcePath).toBe(fixture("happy-session.jsonl"));
      expect(bundle.session.startedAt).toBeInstanceOf(Date);
      expect(bundle.session.endedAt).toBeInstanceOf(Date);
      expect(bundle.session.startedAt.getTime()).toBeLessThan(
        bundle.session.endedAt.getTime(),
      );
    });

    it("normalizes the expected event kinds for a happy session", async () => {
      const bundle = await loadBundle("happy-session.jsonl");
      const kinds = new Set(bundle.session.events.map((event) => event.kind));

      expect(kinds.has("meta")).toBe(true);
      expect(kinds.has("user-message")).toBe(true);
      expect(kinds.has("assistant-reasoning")).toBe(true);
      expect(kinds.has("tool-call")).toBe(true);
      expect(kinds.has("tool-result")).toBe(true);
      expect(kinds.has("assistant-message")).toBe(true);
    });

    it("normalizes interrupts as first-class events", async () => {
      const bundle = await loadBundle("frustrated-session.jsonl");
      const interruptEvents = bundle.session.events.filter(
        (event) => event.kind === "interrupt",
      );

      expect(interruptEvents.length).toBe(1);
      expect(interruptEvents[0].text).toBe(
        "[Request interrupted by user for tool use]",
      );
    });

    it("preserves tool-call path hints from Claude tool input", async () => {
      const bundle = await loadBundle("happy-session.jsonl");
      const toolCallEvents = bundle.session.events.filter(
        (event) => event.kind === "tool-call",
      );

      expect(toolCallEvents.length).toBe(2);
      expect(toolCallEvents[0].pathHints).toContain("src/app/page.tsx");
      expect(toolCallEvents[1].pathHints).toContain("src/app/page.tsx");
    });

    it("rejects session references for a different frontend", async () => {
      const adapter = new ClaudeAdapter();
      const session = createClaudeSessionReference(fixture("happy-session.jsonl"));

      await expect(
        adapter.loadSession({ ...session, frontendId: "codex" }),
      ).rejects.toThrow(
        "ClaudeAdapter cannot load session for frontend: codex",
      );
    });
  });

  describe("equivalence to parser helpers", () => {
    it("preserves extracted user messages across all fixtures", async () => {
      for (const fixtureName of allFixtures) {
        const rawEvents = await parseTranscriptFile(fixture(fixtureName));
        const bundle = await loadBundle(fixtureName);

        expect(extractNormalizedUserMessages(bundle.session.events)).toEqual(
          extractUserMessages(rawEvents),
        );
      }
    });

    it("preserves extracted tool uses across all fixtures", async () => {
      for (const fixtureName of allFixtures) {
        const rawEvents = await parseTranscriptFile(fixture(fixtureName));
        const bundle = await loadBundle(fixtureName);

        expect(extractNormalizedToolUses(bundle.session.events)).toEqual(
          extractToolUses(rawEvents),
        );
      }
    });

    it("preserves tool error counts across all fixtures", async () => {
      for (const fixtureName of allFixtures) {
        const rawEvents = await parseTranscriptFile(fixture(fixtureName));
        const bundle = await loadBundle(fixtureName);

        expect(countNormalizedToolErrors(bundle.session.events)).toBe(
          extractToolErrors(rawEvents),
        );
      }
    });

    it("preserves interrupt counts across all fixtures", async () => {
      for (const fixtureName of allFixtures) {
        const rawEvents = await parseTranscriptFile(fixture(fixtureName));
        const bundle = await loadBundle(fixtureName);

        expect(countNormalizedInterrupts(bundle.session.events)).toBe(
          countInterrupts(rawEvents),
        );
      }
    });

    it("preserves session time ranges across all fixtures", async () => {
      for (const fixtureName of allFixtures) {
        const rawEvents = await parseTranscriptFile(fixture(fixtureName));
        const bundle = await loadBundle(fixtureName);
        const normalizedSessionTimeRange = getNormalizedSessionTimeRange(
          bundle.session.events,
        );
        const rawSessionTimeRange = getSessionTimeRange(rawEvents);

        expect(normalizedSessionTimeRange.start.getTime()).toBe(
          rawSessionTimeRange.start.getTime(),
        );
        expect(normalizedSessionTimeRange.end.getTime()).toBe(
          rawSessionTimeRange.end.getTime(),
        );
      }
    });

    it("derives summary counts from the same normalized equivalents", async () => {
      const bundle = await loadBundle("error-loop-session.jsonl");

      expect(bundle.summary.userMessageCount).toBe(1);
      expect(bundle.summary.toolCallCount).toBe(8);
      expect(bundle.summary.toolErrorCount).toBe(7);
      expect(bundle.summary.interruptCount).toBe(0);
    });
  });
});
