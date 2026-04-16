import {
  INTERRUPT_PATTERN,
  MAX_USER_MESSAGE_LENGTH,
  META_MESSAGE_PATTERNS,
} from "./constants.js";

const shouldExcludeNormalizedMessage = (event: NormalizedEvent): boolean => {
  if (event.isMeta) return true;
  if (!event.text) return true;
  if (event.text.length > MAX_USER_MESSAGE_LENGTH) return true;
  return META_MESSAGE_PATTERNS.some((pattern) => pattern.test(event.text ?? ""));
};

export const extractPathHints = (
  input: Record<string, unknown> | undefined,
): string[] => {
  if (!input) return [];

  const pathHints: string[] = [];

  for (const key of ["file_path", "path", "filePath", "target_file", "file"]) {
    const value = input[key];
    if (typeof value === "string" && !pathHints.includes(value)) {
      pathHints.push(value);
    }
  }

  return pathHints;
};

export const extractNormalizedUserMessages = (
  events: NormalizedEvent[],
): string[] => {
  const messages: string[] = [];

  for (const event of events) {
    if (event.role !== "user") continue;
    if (event.kind !== "user-message" && event.kind !== "interrupt") continue;
    if (shouldExcludeNormalizedMessage(event)) continue;
    const messageText = event.text;
    if (!messageText) continue;
    messages.push(messageText);
  }

  return messages;
};

export const extractNormalizedToolUses = (
  events: NormalizedEvent[],
): ToolUseEntry[] => {
  const toolUses: ToolUseEntry[] = [];

  for (const event of events) {
    if (event.kind !== "tool-call" || !event.toolCall) continue;
    toolUses.push({
      id: event.toolCall.id,
      name: event.toolCall.name,
      input: event.toolCall.arguments,
    });
  }

  return toolUses;
};

export const countNormalizedToolErrors = (
  events: NormalizedEvent[],
): number => {
  let errorCount = 0;

  for (const event of events) {
    if (event.kind !== "tool-result" || !event.toolResult) continue;
    if (event.toolResult.isError) {
      errorCount++;
    }
  }

  return errorCount;
};

export const countNormalizedInterrupts = (
  events: NormalizedEvent[],
): number =>
  events.filter(
    (event) =>
      event.kind === "interrupt" ||
      (event.role === "user" &&
        typeof event.text === "string" &&
        INTERRUPT_PATTERN.test(event.text)),
  ).length;

export const getNormalizedSessionTimeRange = (
  events: NormalizedEvent[],
): SessionTimeRange => {
  let earliest = Infinity;
  let latest = -Infinity;

  for (const event of events) {
    const time = event.timestamp.getTime();
    if (time < earliest) earliest = time;
    if (time > latest) latest = time;
  }

  return {
    start: new Date(earliest === Infinity ? 0 : earliest),
    end: new Date(latest === -Infinity ? 0 : latest),
  };
};

export const buildNormalizedSessionViews = (
  events: NormalizedEvent[],
): NormalizedSessionViews => {
  const messages: NormalizedMessageView[] = [];
  const toolCalls: NormalizedToolCallEvent[] = [];
  const toolResults: NormalizedToolResultEvent[] = [];
  const interrupts: NormalizedInterruptEvent[] = [];

  for (const event of events) {
    if (
      event.role &&
      event.text &&
      (event.kind === "user-message" ||
        event.kind === "assistant-message" ||
        event.kind === "assistant-reasoning" ||
        event.kind === "interrupt")
    ) {
      const kind =
        event.kind === "assistant-reasoning"
          ? "reasoning"
          : event.kind === "interrupt"
            ? "interrupt"
            : "message";

      messages.push({
        id: event.id,
        role: event.role,
        kind,
        text: event.text,
        timestamp: event.timestamp,
        isMeta: event.isMeta,
      });
    }

    if (event.kind === "tool-call" && event.toolCall) {
      toolCalls.push({
        id: event.toolCall.id,
        timestamp: event.timestamp,
        name: event.toolCall.name,
        arguments: event.toolCall.arguments,
        pathHints: event.pathHints,
      });
    }

    if (event.kind === "tool-result" && event.toolResult) {
      toolResults.push({
        id: event.id,
        timestamp: event.timestamp,
        toolCallId: event.toolResult.toolCallId,
        outputText: event.toolResult.outputText,
        isError: event.toolResult.isError,
      });
    }

    if (event.kind === "interrupt") {
      interrupts.push({
        id: event.id,
        timestamp: event.timestamp,
        text: event.text,
      });
    }
  }

  return {
    messages,
    toolCalls,
    toolResults,
    interrupts,
  };
};

export const buildNormalizedSessionSummary = (
  events: NormalizedEvent[],
): NormalizedSessionSummary => {
  const userMessageCount = extractNormalizedUserMessages(events).length;
  const assistantMessageCount = events.filter(
    (event) => event.role === "assistant" && event.kind === "assistant-message",
  ).length;
  const toolCallCount = extractNormalizedToolUses(events).length;
  const toolErrorCount = countNormalizedToolErrors(events);
  const interruptCount = countNormalizedInterrupts(events);

  return {
    userMessageCount,
    assistantMessageCount,
    toolCallCount,
    toolErrorCount,
    interruptCount,
  };
};
