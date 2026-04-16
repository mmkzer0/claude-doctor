import {
  ERROR_LOOP_THRESHOLD,
  ERROR_LOOP_CRITICAL_THRESHOLD,
  ERROR_SNIPPET_MAX_LENGTH,
} from "../constants.js";
import { loadClaudeSessionFromFilePath } from "../adapters/claude.js";

const extractNormalizedErrorSequences = (
  bundle: NormalizedSessionBundle,
): ErrorSequence[] => {
  const errorSequences: ErrorSequence[] = [];

  let currentToolName: string | undefined;
  let consecutiveFailures = 0;
  let errorSnippets: string[] = [];

  for (const event of bundle.session.events) {
    if (event.kind === "tool-call" && event.toolCall) {
      currentToolName = event.toolCall.name;
      continue;
    }

    if (event.kind !== "tool-result" || !event.toolResult) continue;

    if (event.toolResult.isError) {
      consecutiveFailures++;
      const snippet =
        event.toolResult.outputText?.slice(0, ERROR_SNIPPET_MAX_LENGTH) ??
        "unknown error";
      errorSnippets.push(snippet);
      continue;
    }

    if (consecutiveFailures >= ERROR_LOOP_THRESHOLD && currentToolName) {
      errorSequences.push({
        toolName: currentToolName,
        consecutiveFailures,
        errorSnippets: [...errorSnippets],
      });
    }

    consecutiveFailures = 0;
    errorSnippets = [];
  }

  if (consecutiveFailures >= ERROR_LOOP_THRESHOLD && currentToolName) {
    errorSequences.push({
      toolName: currentToolName,
      consecutiveFailures,
      errorSnippets: [...errorSnippets],
    });
  }

  return errorSequences;
};

export const detectErrorLoops = async (
  filePath: string,
  sessionId: string,
): Promise<SignalResult[]> => {
  const bundle = await loadClaudeSessionFromFilePath(filePath);
  return detectErrorLoopsFromBundle(bundle, sessionId);
};

export const detectErrorLoopsFromBundle = (
  bundle: NormalizedSessionBundle,
  sessionId = bundle.session.sessionId,
): SignalResult[] => {
  const errorSequences = extractNormalizedErrorSequences(bundle);
  const signals: SignalResult[] = [];

  for (const sequence of errorSequences) {
    signals.push({
      signalName: "error-loop",
      severity: sequence.consecutiveFailures >= ERROR_LOOP_CRITICAL_THRESHOLD ? "critical" : "high",
      score: -sequence.consecutiveFailures,
      details: `${sequence.consecutiveFailures} consecutive failures on tool "${sequence.toolName}"`,
      sessionId,
      examples: sequence.errorSnippets.slice(0, 3),
    });
  }

  return signals;
};
