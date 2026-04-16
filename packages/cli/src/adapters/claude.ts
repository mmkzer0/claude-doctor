import * as path from "node:path";
import {
  INTERRUPT_PATTERN,
  META_MESSAGE_PATTERNS,
} from "../constants.js";
import {
  isAssistantEvent,
  isUserEvent,
  parseTranscriptFile,
} from "../parser.js";
import {
  buildNormalizedSessionSummary,
  buildNormalizedSessionViews,
  extractPathHints,
  getNormalizedSessionTimeRange,
} from "../normalized.js";

const buildEventId = (
  event: TranscriptEvent,
  blockIndex?: number,
  suffix?: string,
): string => {
  const baseId =
    event.uuid ??
    `${event.sessionId}:${event.timestamp}:${event.type}:${blockIndex ?? 0}`;

  if (suffix == null) return baseId;
  return `${baseId}:${suffix}`;
};

const buildSourceEventId = (event: TranscriptEvent): string =>
  event.uuid ?? `${event.sessionId}:${event.timestamp}:${event.type}`;

const isMetaContent = (content: string): boolean =>
  META_MESSAGE_PATTERNS.some((pattern) => pattern.test(content));

const toolResultText = (block: ToolResultBlock): string | undefined => {
  if (typeof block.content === "string") return block.content;
  return block.content
    ?.map((innerBlock) => innerBlock.text ?? "")
    .join("");
};

const isToolResultBlock = (
  block: ToolResultBlock | ContentBlock,
): block is ToolResultBlock =>
  block.type === "tool_result" &&
  "tool_use_id" in block &&
  "content" in block;

const normalizeClaudeEvent = (event: TranscriptEvent): NormalizedEvent[] => {
  if (event.type === "queue-operation" && "operation" in event) {
    return [
      {
        id: buildEventId(event),
        sourceEventId: buildSourceEventId(event),
        sessionId: event.sessionId,
        timestamp: new Date(event.timestamp),
        kind: "meta",
        isMeta: true,
        isEventMeta: false,
        rawType: event.type,
        pathHints: [],
        text: "content" in event ? event.content : undefined,
        parentId: event.parentUuid,
      },
    ];
  }

  if (isUserEvent(event)) {
    const content = event.message.content;

    if (typeof content === "string") {
      const isInterrupt = INTERRUPT_PATTERN.test(content);
      const isMeta = event.isMeta === true || isMetaContent(content);

      return [
        {
          id: buildEventId(event),
          sourceEventId: buildSourceEventId(event),
          sessionId: event.sessionId,
          timestamp: new Date(event.timestamp),
          kind: isInterrupt ? "interrupt" : isMeta ? "meta" : "user-message",
          role: "user",
          text: content,
          parentId: event.parentUuid,
          isMeta,
          isEventMeta: event.isMeta === true,
          rawType: event.type,
          pathHints: [],
        },
      ];
    }

    if (!Array.isArray(content)) return [];

    const normalizedEvents: NormalizedEvent[] = [];

    for (const [blockIndex, block] of content.entries()) {
      if (!isToolResultBlock(block)) continue;

      const outputText = toolResultText(block);
      const hasToolUseErrorMarker = outputText?.includes("<tool_use_error>");

      normalizedEvents.push(
        {
          id: buildEventId(event, blockIndex, "tool-result"),
          sourceEventId: buildSourceEventId(event),
          sessionId: event.sessionId,
          timestamp: new Date(event.timestamp),
          kind: "tool-result",
          role: "user",
          parentId: event.parentUuid,
          isMeta: false,
          isEventMeta: event.isMeta === true,
          rawType: event.type,
          pathHints: [],
          toolResult: {
            toolCallId: block.tool_use_id,
            outputText,
            isError: block.is_error === true || hasToolUseErrorMarker === true,
          },
        },
      );
    }

    return normalizedEvents;
  }

  if (isAssistantEvent(event)) {
    const content = event.message.content;
    if (!Array.isArray(content)) return [];

    const normalizedEvents: NormalizedEvent[] = [];

    for (const [blockIndex, block] of content.entries()) {
      if (block.type === "text") {
        normalizedEvents.push(
        {
          id: buildEventId(event, blockIndex, "assistant-message"),
          sourceEventId: buildSourceEventId(event),
          sessionId: event.sessionId,
          timestamp: new Date(event.timestamp),
          kind: "assistant-message",
          role: "assistant",
          text: block.text,
          parentId: event.parentUuid,
          isMeta: false,
          isEventMeta: false,
          rawType: event.type,
          pathHints: [],
        },
        );
        continue;
      }

      if (block.type === "thinking") {
        normalizedEvents.push(
        {
          id: buildEventId(event, blockIndex, "assistant-reasoning"),
          sourceEventId: buildSourceEventId(event),
          sessionId: event.sessionId,
          timestamp: new Date(event.timestamp),
          kind: "assistant-reasoning",
          role: "assistant",
          text: block.thinking,
          parentId: event.parentUuid,
          isMeta: false,
          isEventMeta: false,
          rawType: event.type,
          pathHints: [],
        },
        );
        continue;
      }

      if (block.type === "tool_use") {
        normalizedEvents.push(
        {
          id: buildEventId(event, blockIndex, "tool-call"),
          sourceEventId: buildSourceEventId(event),
          sessionId: event.sessionId,
          timestamp: new Date(event.timestamp),
          kind: "tool-call",
          role: "assistant",
          parentId: event.parentUuid,
          isMeta: false,
          isEventMeta: false,
          rawType: event.type,
          pathHints: extractPathHints(block.input),
          toolCall: {
              id: block.id,
              name: block.name,
              arguments: block.input,
            },
          },
        );
      }
    }

    return normalizedEvents;
  }

  return [
    {
      id: buildEventId(event),
      sourceEventId: buildSourceEventId(event),
      sessionId: event.sessionId,
      timestamp: new Date(event.timestamp),
      kind: "meta",
      isMeta: true,
      isEventMeta: false,
      rawType: event.type,
      pathHints: [],
      parentId: event.parentUuid,
    },
  ];
};

export const createClaudeSessionReference = (
  sourcePath: string,
): SessionReference => {
  const sessionId = path.basename(sourcePath, ".jsonl");
  const projectPath = path.dirname(sourcePath);
  const projectName = path.basename(projectPath);

  return {
    frontendId: "claude",
    sessionId,
    projectId: projectPath,
    projectPath,
    projectName,
    sourcePath,
  };
};

export class ClaudeAdapter implements TranscriptAdapter {
  readonly frontendId = "claude";

  async loadSession(
    session: SessionReference,
  ): Promise<NormalizedSessionBundle> {
    if (session.frontendId !== this.frontendId) {
      throw new Error(
        `ClaudeAdapter cannot load session for frontend: ${session.frontendId}`,
      );
    }

    const transcriptEvents = await parseTranscriptFile(session.sourcePath);
    const normalizedEvents = transcriptEvents.flatMap(normalizeClaudeEvent);
    const sessionTimeRange = getNormalizedSessionTimeRange(normalizedEvents);
    const normalizedSession: NormalizedSession = {
      frontendId: this.frontendId,
      sessionId: session.sessionId,
      projectId: session.projectId,
      projectPath: session.projectPath,
      projectName: session.projectName,
      sourcePath: session.sourcePath,
      cwd: transcriptEvents.find((event) => typeof event.cwd === "string")?.cwd,
      startedAt: sessionTimeRange.start,
      endedAt: sessionTimeRange.end,
      events: normalizedEvents,
    };
    const views = buildNormalizedSessionViews(normalizedEvents);
    const summary = buildNormalizedSessionSummary(normalizedEvents);

    return {
      session: normalizedSession,
      views,
      summary,
    };
  }
}

export const loadClaudeSessionFromFilePath = async (
  sourcePath: string,
): Promise<NormalizedSessionBundle> => {
  const adapter = new ClaudeAdapter();
  return adapter.loadSession(createClaudeSessionReference(sourcePath));
};
