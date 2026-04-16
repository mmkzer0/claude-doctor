import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadClaudeSessionFromFilePath } from "./adapters/claude.js";
import { CLAUDE_PROJECTS_DIR } from "./constants.js";
import {
  countNormalizedInterrupts,
  countNormalizedToolErrors,
  extractNormalizedToolUses,
  extractNormalizedUserMessages,
} from "./normalized.js";

const decodeProjectName = (encodedName: string): string =>
  encodedName.replace(/-/g, "/").replace(/^\//, "");

const countAssistantSourceEvents = (events: NormalizedEvent[]): number => {
  const assistantSourceEventIds = new Set<string>();

  for (const event of events) {
    if (event.role !== "assistant") continue;
    assistantSourceEventIds.add(event.sourceEventId ?? event.id);
  }

  return assistantSourceEventIds.size;
};

const buildSessionMetadataFromBundle = (
  bundle: NormalizedSessionBundle,
  filePath: string,
  projectPath: string,
  projectName: string,
): SessionMetadata => ({
  sessionId: path.basename(filePath, ".jsonl"),
  projectPath,
  projectName,
  filePath,
  startTime: bundle.session.startedAt,
  endTime: bundle.session.endedAt,
  userMessageCount: extractNormalizedUserMessages(bundle.session.events).length,
  assistantMessageCount: countAssistantSourceEvents(bundle.session.events),
  toolCallCount: extractNormalizedToolUses(bundle.session.events).length,
  toolErrorCount: countNormalizedToolErrors(bundle.session.events),
  interruptCount: countNormalizedInterrupts(bundle.session.events),
});

export const getProjectsDir = (): string =>
  path.join(os.homedir(), CLAUDE_PROJECTS_DIR);

export const discoverProjects = (projectsDir: string): string[] => {
  if (!fs.existsSync(projectsDir)) return [];
  return fs
    .readdirSync(projectsDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);
};

export const discoverSessions = (projectDir: string): string[] =>
  fs
    .readdirSync(projectDir)
    .filter(
      (fileName) =>
        fileName.endsWith(".jsonl") && !fileName.startsWith("agent-"),
    );

export const buildSessionMetadata = async (
  filePath: string,
  projectPath: string,
  projectName: string,
): Promise<SessionMetadata> => {
  const bundle = await loadClaudeSessionFromFilePath(filePath);

  return buildSessionMetadataFromBundle(
    bundle,
    filePath,
    projectPath,
    projectName,
  );
};

export const indexAllProjects = async (
  projectFilter?: string,
): Promise<ProjectMetadata[]> => {
  const projectsDir = getProjectsDir();
  const projectDirs = discoverProjects(projectsDir);
  const projects: ProjectMetadata[] = [];

  for (const encodedName of projectDirs) {
    const decodedName = decodeProjectName(encodedName);

    if (projectFilter && !decodedName.includes(projectFilter)) continue;

    const projectDir = path.join(projectsDir, encodedName);
    const sessionFiles = discoverSessions(projectDir);

    if (sessionFiles.length === 0) continue;

    const sessions: SessionMetadata[] = [];
    for (const sessionFile of sessionFiles) {
      const filePath = path.join(projectDir, sessionFile);
      try {
        const metadata = await buildSessionMetadata(
          filePath,
          decodedName,
          encodedName,
        );
        sessions.push(metadata);
      } catch {
        /* skip unreadable session files */
      }
    }

    sessions.sort(
      (left, right) => left.startTime.getTime() - right.startTime.getTime(),
    );

    projects.push({
      projectPath: decodedName,
      projectName: encodedName,
      sessions,
      totalSessions: sessions.length,
    });
  }

  projects.sort((left, right) => right.totalSessions - left.totalSessions);

  return projects;
};
