import * as path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import {
  SEVERITY_WEIGHT_CRITICAL,
  SEVERITY_WEIGHT_HIGH,
  SEVERITY_WEIGHT_LOW,
  SEVERITY_WEIGHT_MEDIUM,
} from "../src/constants.js";
import { buildSessionMetadata } from "../src/indexer.js";
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

const buildFixtureProject = async (): Promise<ProjectMetadata> => {
  const sessionFiles = [
    "happy-session.jsonl",
    "frustrated-session.jsonl",
    "error-loop-session.jsonl",
    "thrashing-session.jsonl",
  ];
  const projectPath = "fixtures/project-alpha";
  const projectName = "fixtures-project-alpha";
  const sessions = await Promise.all(
    sessionFiles.map((sessionFile) =>
      buildSessionMetadata(fixture(sessionFile), projectPath, projectName),
    ),
  );

  sessions.sort(
    (left, right) => left.startTime.getTime() - right.startTime.getTime(),
  );

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
    const project = await buildFixtureProject();

    expect(await analyzeProject(project)).toEqual(
      await analyzeProjectLegacy(project),
    );
  });
});
