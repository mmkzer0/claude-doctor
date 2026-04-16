import * as path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { loadClaudeSessionFromFilePath } from "../src/adapters/claude.js";
import {
  analyzeSessionSentiment,
  analyzeSessionSentimentFromBundle,
  checkSession,
  collectSessionSignals,
  detectBehavioralSignals,
  detectErrorLoops,
  detectErrorLoopsFromBundle,
  detectThrashing,
  detectThrashingFromBundle,
  detectToolInefficiency,
  detectToolInefficiencyFromBundle,
  sentimentToSignals,
} from "../src/index.js";

const fixture = (name: string): string =>
  path.join(import.meta.dirname, "fixtures", name);

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

const sortSignalsForParity = (
  signals: SignalResult[],
): Array<{ signalName: string; severity: string; score: number }> =>
  signals
    .map((signal) => ({
      signalName: signal.signalName,
      severity: signal.severity,
      score: signal.score,
    }))
    .sort(
      (left, right) =>
        left.signalName.localeCompare(right.signalName) ||
        left.severity.localeCompare(right.severity) ||
        left.score - right.score,
    );

describe("normalized signal-entry migration", () => {
  describe("bundle parity", () => {
    it("keeps sentiment analysis equivalent to the wrapper", async () => {
      const filePath = fixture("frustrated-session.jsonl");
      const bundle = await loadClaudeSessionFromFilePath(filePath);

      expect(
        analyzeSessionSentimentFromBundle(bundle, "frustrated-001"),
      ).toEqual(await analyzeSessionSentiment(filePath, "frustrated-001"));
    });

    it("keeps thrashing detection equivalent to the wrapper", async () => {
      const filePath = fixture("thrashing-session.jsonl");
      const bundle = await loadClaudeSessionFromFilePath(filePath);

      expect(detectThrashingFromBundle(bundle, "thrash-001")).toEqual(
        await detectThrashing(filePath, "thrash-001"),
      );
    });

    it("keeps error-loop detection equivalent to the wrapper", async () => {
      const filePath = fixture("error-loop-session.jsonl");
      const bundle = await loadClaudeSessionFromFilePath(filePath);

      expect(detectErrorLoopsFromBundle(bundle, "error-001")).toEqual(
        await detectErrorLoops(filePath, "error-001"),
      );
    });

    it("keeps tool inefficiency detection equivalent to the wrapper", async () => {
      const filePath = fixture("exploration-heavy-session.jsonl");
      const bundle = await loadClaudeSessionFromFilePath(filePath);

      expect(
        detectToolInefficiencyFromBundle(bundle, "explore-001"),
      ).toEqual(await detectToolInefficiency(filePath, "explore-001"));
    });
  });

  describe("collector parity", () => {
    it("matches the manual per-session signal composition across all fixtures", async () => {
      for (const fixtureName of allFixtures) {
        const filePath = fixture(fixtureName);
        const sessionId = fixtureName.replace(/\.jsonl$/, "");
        const sentiment = await analyzeSessionSentiment(filePath, sessionId);

        const manuallyCollectedSignals = [
          ...sentimentToSignals(sentiment),
          ...(await detectThrashing(filePath, sessionId)),
          ...(await detectErrorLoops(filePath, sessionId)),
          ...(await detectToolInefficiency(filePath, sessionId)),
          ...(await detectBehavioralSignals(filePath, sessionId)),
        ];

        expect(
          sortSignalsForParity(await collectSessionSignals(filePath, sessionId)),
        ).toEqual(sortSignalsForParity(manuallyCollectedSignals));
      }
    });
  });

  describe("checkSession snapshots", () => {
    it("keeps clean-session check output stable", async () => {
      await expect(
        checkSession(fixture("happy-session.jsonl"), "happy-001"),
      ).resolves.toMatchInlineSnapshot(`
        {
          "activeSignals": [],
          "guidance": [],
          "isHealthy": true,
          "sessionId": "happy-001",
        }
      `);
    });

    it("keeps problematic-session check output stable", async () => {
      const result = await checkSession(
        fixture("frustrated-session.jsonl"),
        "frustrated-001",
      );

      expect({
        activeSignals: sortSignalsForParity(result.activeSignals),
        guidance: [...result.guidance].sort((left, right) =>
          left.localeCompare(right),
        ),
        isHealthy: result.isHealthy,
        sessionId: result.sessionId,
      }).toMatchInlineSnapshot(`
        {
          "activeSignals": [
            {
              "score": -10,
              "severity": "critical",
              "signalName": "extreme-frustration",
            },
            {
              "score": -3,
              "severity": "medium",
              "signalName": "high-turn-ratio",
            },
            {
              "score": -6,
              "severity": "critical",
              "signalName": "negative-sentiment",
            },
            {
              "score": -2,
              "severity": "high",
              "signalName": "user-interrupts",
            },
          ],
          "guidance": [
            "The user interrupted you. Whatever you were doing was wrong. Stop and ask what they actually want.",
            "The user is frustrated. Acknowledge the issue, ask clarifying questions if needed, and focus on getting it right this time.",
          ],
          "isHealthy": false,
          "sessionId": "frustrated-001",
        }
      `);
    });
  });
});
