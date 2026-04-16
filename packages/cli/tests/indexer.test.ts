import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  buildSessionMetadata,
  indexAllProjects,
} from "../src/indexer.js";
import {
  countInterrupts,
  extractToolErrors,
  extractToolUses,
  extractUserMessages,
  getSessionTimeRange,
  parseTranscriptFile,
} from "../src/parser.js";

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

const buildLegacySessionMetadata = async (
  filePath: string,
  projectPath: string,
  projectName: string,
): Promise<SessionMetadata> => {
  const sessionId = path.basename(filePath, ".jsonl");
  const events = await parseTranscriptFile(filePath);
  const sessionTimeRange = getSessionTimeRange(events);

  return {
    sessionId,
    projectPath,
    projectName,
    filePath,
    startTime: sessionTimeRange.start,
    endTime: sessionTimeRange.end,
    userMessageCount: extractUserMessages(events).length,
    assistantMessageCount: events.filter(
      (event) => event.type === "assistant",
    ).length,
    toolCallCount: extractToolUses(events).length,
    toolErrorCount: extractToolErrors(events),
    interruptCount: countInterrupts(events),
  };
};

const temporaryPaths: string[] = [];

const createTemporaryDirectory = (): string => {
  const directoryPath = fs.mkdtempSync(
    path.join(os.tmpdir(), "claude-doctor-indexer-"),
  );
  temporaryPaths.push(directoryPath);
  return directoryPath;
};

const writeFixtureSession = (
  projectDirectory: string,
  fixtureName: string,
  targetFileName = fixtureName,
): void => {
  fs.writeFileSync(
    path.join(projectDirectory, targetFileName),
    fs.readFileSync(fixture(fixtureName), "utf8"),
    "utf8",
  );
};

afterEach(() => {
  while (temporaryPaths.length > 0) {
    const directoryPath = temporaryPaths.pop();
    if (!directoryPath) continue;
    fs.rmSync(directoryPath, { recursive: true, force: true });
  }
});

describe("indexer", () => {
  describe("buildSessionMetadata", () => {
    it("preserves legacy session metadata across all fixtures", async () => {
      for (const fixtureName of allFixtures) {
        const filePath = fixture(fixtureName);
        const projectPath = "fixtures/project-alpha";
        const projectName = "fixtures-project-alpha";

        expect(
          await buildSessionMetadata(filePath, projectPath, projectName),
        ).toEqual(
          await buildLegacySessionMetadata(filePath, projectPath, projectName),
        );
      }
    });
  });

  describe("indexAllProjects", () => {
    it("keeps discovery, filtering, sorting, and bad-file skipping unchanged", async () => {
      const temporaryHomeDirectory = createTemporaryDirectory();
      const projectsDirectory = path.join(
        temporaryHomeDirectory,
        ".claude",
        "projects",
      );

      fs.mkdirSync(projectsDirectory, { recursive: true });

      const largerProjectDirectory = path.join(
        projectsDirectory,
        "workspace-project-alpha",
      );
      const smallerProjectDirectory = path.join(
        projectsDirectory,
        "workspace-project-beta",
      );

      fs.mkdirSync(largerProjectDirectory);
      fs.mkdirSync(smallerProjectDirectory);

      writeFixtureSession(
        largerProjectDirectory,
        "frustrated-session.jsonl",
        "b-frustrated.jsonl",
      );
      writeFixtureSession(
        largerProjectDirectory,
        "happy-session.jsonl",
        "a-happy.jsonl",
      );
      writeFixtureSession(
        smallerProjectDirectory,
        "thrashing-session.jsonl",
        "only-thrashing.jsonl",
      );
      fs.mkdirSync(path.join(largerProjectDirectory, "broken.jsonl"));
      fs.writeFileSync(
        path.join(largerProjectDirectory, "agent-sidechain.jsonl"),
        fs.readFileSync(fixture("happy-session.jsonl"), "utf8"),
        "utf8",
      );

      const originalHomeDirectory = process.env.HOME;
      process.env.HOME = temporaryHomeDirectory;

      try {
        const allProjects = await indexAllProjects();

        expect(allProjects.map((project) => project.projectPath)).toEqual([
          "workspace/project/alpha",
          "workspace/project/beta",
        ]);

        expect(
          [...(allProjects[0]?.sessions.map((session) => session.sessionId) ?? [])].sort(),
        ).toEqual(["a-happy", "b-frustrated"]);
        expect(
          allProjects[0]?.sessions.map((session) => session.startTime.getTime()),
        ).toEqual(
          [...(allProjects[0]?.sessions.map((session) => session.startTime.getTime()) ?? [])].sort(
            (left, right) => left - right,
          ),
        );
        expect(allProjects[0]?.totalSessions).toBe(2);
        expect(allProjects[1]?.totalSessions).toBe(1);

        const filteredProjects = await indexAllProjects(
          "workspace/project/beta",
        );

        expect(filteredProjects.map((project) => project.projectPath)).toEqual([
          "workspace/project/beta",
        ]);
        expect(filteredProjects[0]?.sessions.map((session) => session.sessionId)).toEqual(
          ["only-thrashing"],
        );
      } finally {
        if (originalHomeDirectory == null) {
          delete process.env.HOME;
        } else {
          process.env.HOME = originalHomeDirectory;
        }
      }
    });
  });
});
