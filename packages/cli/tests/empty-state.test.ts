import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  formatReportMarkdown,
  generateReport,
  renderAnalyzeOutput,
  renderNoSessionsFound,
} from "../src/index.js";

const temporaryPaths: string[] = [];

const createTemporaryDirectory = (): string => {
  const directoryPath = fs.mkdtempSync(
    path.join(os.tmpdir(), "claude-doctor-empty-state-"),
  );
  temporaryPaths.push(directoryPath);
  return directoryPath;
};

afterEach(() => {
  while (temporaryPaths.length > 0) {
    const directoryPath = temporaryPaths.pop();
    if (!directoryPath) continue;
    fs.rmSync(directoryPath, { recursive: true, force: true });
  }
});

describe("empty-state diagnostics", () => {
  it("attaches discovery diagnostics to empty reports", async () => {
    const temporaryHomeDirectory = createTemporaryDirectory();
    const originalHomeDirectory = process.env.HOME;
    process.env.HOME = temporaryHomeDirectory;

    try {
      const report = await generateReport();

      expect(report.totalSessions).toBe(0);
      expect(report.totalProjects).toBe(0);
      expect(report.discovery).toEqual({
        projectFilter: undefined,
        warnings: [
          `Claude transcripts directory not found at ${path.join(temporaryHomeDirectory, ".claude", "projects")}`,
        ],
        locations: [
          {
            frontendId: "claude",
            rootPath: path.join(
              temporaryHomeDirectory,
              ".claude",
              "projects",
            ),
            exists: false,
            projectDirectoriesDiscovered: 0,
            matchingProjectDirectories: 0,
            sessionFilesDiscovered: 0,
            matchingSessionFiles: 0,
            loadedSessionFiles: 0,
            failedSessionFiles: 0,
          },
        ],
      });
    } finally {
      if (originalHomeDirectory == null) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHomeDirectory;
      }
    }
  });

  it("renders a useful no-sessions message for humans", async () => {
    const discovery: DiscoveryReport = {
      projectFilter: "workspace/project",
      warnings: ["No Claude projects matched filter \"workspace/project\""],
      locations: [
        {
          frontendId: "claude",
          rootPath: "/tmp/example/.claude/projects",
          exists: true,
          projectDirectoriesDiscovered: 2,
          matchingProjectDirectories: 0,
          sessionFilesDiscovered: 7,
          matchingSessionFiles: 0,
          loadedSessionFiles: 0,
          failedSessionFiles: 0,
        },
      ],
    };

    expect(renderNoSessionsFound(discovery)).toContain("No sessions found.");
    expect(renderNoSessionsFound(discovery)).toContain(
      "/tmp/example/.claude/projects",
    );
    expect(renderNoSessionsFound(discovery)).toContain(
      "projects: 2 discovered, 0 matched",
    );
    expect(renderNoSessionsFound(discovery)).toContain(
      "sessions: 7 discovered, 0 matched",
    );
    expect(renderNoSessionsFound(discovery)).toContain("loaded: 0, failed: 0");
    expect(renderNoSessionsFound(discovery)).toContain(
      "project filter: workspace/project",
    );

    const report: AnalysisReport = {
      generatedAt: new Date("2026-04-16T00:00:00.000Z"),
      totalSessions: 0,
      totalProjects: 0,
      projects: [],
      topSignals: [],
      suggestions: [],
      discovery,
    };

    await expect(renderAnalyzeOutput(report)).resolves.toContain(
      "No sessions found.",
    );
    expect(formatReportMarkdown(report)).toContain("## Discovery");
    expect(formatReportMarkdown(report)).toContain(
      "/tmp/example/.claude/projects",
    );
  });
});
