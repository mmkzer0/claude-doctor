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

interface ClaudeDiscoveredProject {
  encodedName: string;
  decodedName: string;
  projectDir: string;
  sessionFiles: string[];
}

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
    .readdirSync(projectDir, { withFileTypes: true })
    .filter(
      (dirent) =>
        dirent.isFile() &&
        dirent.name.endsWith(".jsonl") &&
        !dirent.name.startsWith("agent-"),
    )
    .map((dirent) => dirent.name);

const discoverClaudeProjectsWithDiagnostics = (
  projectFilter?: string,
): {
  projectsDir: string;
  discoveryLocation: DiscoveryLocation;
  discoveredProjects: ClaudeDiscoveredProject[];
} => {
  const projectsDir = getProjectsDir();
  const rootExists = fs.existsSync(projectsDir);

  if (!rootExists) {
    return {
      projectsDir,
      discoveryLocation: {
        frontendId: "claude",
        rootPath: projectsDir,
        exists: false,
        projectDirectoriesDiscovered: 0,
        matchingProjectDirectories: 0,
        sessionFilesDiscovered: 0,
        matchingSessionFiles: 0,
        loadedSessionFiles: 0,
        failedSessionFiles: 0,
      },
      discoveredProjects: [],
    };
  }

  const encodedProjectNames = discoverProjects(projectsDir);
  const discoveredProjects: ClaudeDiscoveredProject[] = [];
  let sessionFilesDiscovered = 0;
  let matchingSessionFiles = 0;

  for (const encodedName of encodedProjectNames) {
    const decodedName = decodeProjectName(encodedName);
    const projectDir = path.join(projectsDir, encodedName);
    const sessionFiles = discoverSessions(projectDir);

    sessionFilesDiscovered += sessionFiles.length;

    if (projectFilter && !decodedName.includes(projectFilter)) continue;

    matchingSessionFiles += sessionFiles.length;

    discoveredProjects.push({
      encodedName,
      decodedName,
      projectDir,
      sessionFiles,
    });
  }

  return {
    projectsDir,
    discoveryLocation: {
      frontendId: "claude",
      rootPath: projectsDir,
      exists: true,
      projectDirectoriesDiscovered: encodedProjectNames.length,
      matchingProjectDirectories: discoveredProjects.length,
      sessionFilesDiscovered,
      matchingSessionFiles,
      loadedSessionFiles: 0,
      failedSessionFiles: 0,
    },
    discoveredProjects,
  };
};

const buildDiscoveryReport = (
  projectFilter: string | undefined,
  discoveryLocation: DiscoveryLocation,
): DiscoveryReport => {
  const warnings: string[] = [];

  if (!discoveryLocation.exists) {
    warnings.push(
      `Claude transcripts directory not found at ${discoveryLocation.rootPath}`,
    );
  } else if (discoveryLocation.projectDirectoriesDiscovered === 0) {
    warnings.push(
      `No Claude project directories were found under ${discoveryLocation.rootPath}`,
    );
  } else if (discoveryLocation.matchingProjectDirectories === 0) {
    warnings.push(
      projectFilter
        ? `No Claude projects matched filter "${projectFilter}"`
        : `No Claude projects produced matching session files under ${discoveryLocation.rootPath}`,
    );
  } else if (discoveryLocation.matchingSessionFiles === 0) {
    warnings.push(
      projectFilter
        ? `No Claude session files matched filter "${projectFilter}"`
        : `No Claude session files were found under ${discoveryLocation.rootPath}`,
    );
  } else if (discoveryLocation.loadedSessionFiles === 0) {
    warnings.push(
      `Claude session files were found under ${discoveryLocation.rootPath}, but none could be analyzed (${discoveryLocation.failedSessionFiles} failed)`,
    );
  }

  return {
    projectFilter,
    locations: [discoveryLocation],
    warnings,
  };
};

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

export const indexAllProjectsWithDiscovery = async (
  projectFilter?: string,
): Promise<IndexedProjectsResult> => {
  const { discoveryLocation, discoveredProjects } =
    discoverClaudeProjectsWithDiagnostics(projectFilter);
  const projects: ProjectMetadata[] = [];
  let loadedSessionFiles = 0;
  let failedSessionFiles = 0;

  for (const discoveredProject of discoveredProjects) {
    const { decodedName, encodedName, projectDir, sessionFiles } =
      discoveredProject;
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
        loadedSessionFiles++;
      } catch {
        failedSessionFiles++;
        /* skip unreadable session files */
      }
    }

    sessions.sort(
      (left, right) => left.startTime.getTime() - right.startTime.getTime(),
    );

    if (sessions.length === 0) continue;

    projects.push({
      projectPath: decodedName,
      projectName: encodedName,
      sessions,
      totalSessions: sessions.length,
    });
  }

  projects.sort((left, right) => right.totalSessions - left.totalSessions);

  const finalizedDiscoveryLocation: DiscoveryLocation = {
    ...discoveryLocation,
    loadedSessionFiles,
    failedSessionFiles,
  };

  return {
    projects,
    discovery: buildDiscoveryReport(projectFilter, finalizedDiscoveryLocation),
  };
};

export const indexAllProjects = async (
  projectFilter?: string,
): Promise<ProjectMetadata[]> =>
  (await indexAllProjectsWithDiscovery(projectFilter)).projects;

export const findLatestSessionWithDiscovery = (
  projectFilter?: string,
): LatestSessionLookup => {
  const { discoveryLocation, discoveredProjects } =
    discoverClaudeProjectsWithDiagnostics(projectFilter);

  let latestTime = 0;
  let latestFile: string | undefined;

  for (const discoveredProject of discoveredProjects) {
    for (const sessionFile of discoveredProject.sessionFiles) {
      const filePath = path.join(discoveredProject.projectDir, sessionFile);
      const fileStat = fs.statSync(filePath);

      if (fileStat.mtimeMs > latestTime) {
        latestTime = fileStat.mtimeMs;
        latestFile = filePath;
      }
    }
  }

  return {
    session: latestFile
      ? {
          filePath: latestFile,
          sessionId: path.basename(latestFile, ".jsonl"),
        }
      : undefined,
    discovery: buildDiscoveryReport(projectFilter, discoveryLocation),
  };
};
