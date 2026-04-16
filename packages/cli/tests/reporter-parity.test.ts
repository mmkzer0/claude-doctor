import * as path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import {
  SEVERITY_WEIGHT_CRITICAL,
  SEVERITY_WEIGHT_HIGH,
  SEVERITY_WEIGHT_LOW,
  SEVERITY_WEIGHT_MEDIUM,
} from "../src/constants.js";
import { analyzeProject } from "../src/reporter.js";
import { detectAbandonment } from "../src/signals/abandonment.js";
import {
  analyzeSessionSentiment,
  sentimentToSignals,
} from "../src/signals/sentiment.js";
import { detectThrashing } from "../src/signals/thrashing.js";
import { detectErrorLoops } from "../src/signals/error-loops.js";
import { detectToolInefficiency } from "../src/signals/tool-efficiency.js";
import { detectBehavioralSignals } from "../src/signals/behavioral.js";

const fixture = (name: string): string =>
  path.join(import.meta.dirname, "fixtures", name);

const buildSessionMetadataFixture = (
  sessionId: string,
  sessionFile: string,
  minutesFromStart: number,
): SessionMetadata => ({
  sessionId,
  projectPath: "fixtures/project-alpha",
  projectName: "fixtures-project-alpha",
  filePath: fixture(sessionFile),
  startTime: new Date(`2026-04-16T10:${String(minutesFromStart).padStart(2, "0")}:00.000Z`),
  endTime: new Date(`2026-04-16T10:${String(minutesFromStart + 1).padStart(2, "0")}:00.000Z`),
  userMessageCount: 3,
  assistantMessageCount: 3,
  toolCallCount: 0,
  toolErrorCount: 0,
  interruptCount: 0,
});

const buildFixtureProject = (): ProjectMetadata => {
  const sessions = [
    buildSessionMetadataFixture("happy-session", "happy-session.jsonl", 0),
    buildSessionMetadataFixture(
      "frustrated-session",
      "frustrated-session.jsonl",
      2,
    ),
    buildSessionMetadataFixture(
      "error-loop-session",
      "error-loop-session.jsonl",
      4,
    ),
    buildSessionMetadataFixture("thrashing-session", "thrashing-session.jsonl", 6),
  ];
  const projectPath = "fixtures/project-alpha";
  const projectName = "fixtures-project-alpha";

  return {
    projectPath,
    projectName,
    sessions,
    totalSessions: sessions.length,
  };
};

const analyzeProjectLegacy = async (
  project: ProjectMetadata,
): Promise<ProjectAnalysis> => {
  const signals: SignalResult[] = [];
  const severityWeights = {
    critical: SEVERITY_WEIGHT_CRITICAL,
    high: SEVERITY_WEIGHT_HIGH,
    medium: SEVERITY_WEIGHT_MEDIUM,
    low: SEVERITY_WEIGHT_LOW,
  };

  signals.push(...detectAbandonment(project.sessions));

  for (const session of project.sessions) {
    const sentiment = await analyzeSessionSentiment(
      session.filePath,
      session.sessionId,
    );
    signals.push(...sentimentToSignals(sentiment));
    signals.push(...await detectThrashing(session.filePath, session.sessionId));
    signals.push(...await detectErrorLoops(session.filePath, session.sessionId));
    signals.push(
      ...await detectToolInefficiency(session.filePath, session.sessionId),
    );
    signals.push(
      ...await detectBehavioralSignals(session.filePath, session.sessionId),
    );
  }

  signals.sort((left, right) => left.score - right.score);

  const overallScore =
    signals.length > 0
      ? signals.reduce(
          (sum, signal) =>
            sum + signal.score * severityWeights[signal.severity],
          0,
        ) / project.totalSessions
      : 0;

  return {
    projectName: project.projectPath,
    projectPath: project.projectPath,
    sessionCount: project.totalSessions,
    signals,
    overallScore,
  };
};

describe("reporter parity", () => {
  it("keeps analyzeProject equivalent to the legacy per-session composition", async () => {
    const project = buildFixtureProject();

    expect(await analyzeProject(project)).toEqual(
      await analyzeProjectLegacy(project),
    );
  });
});
