import { loadClaudeSessionFromFilePath } from "../adapters/claude.js";
import { detectBehavioralSignalsFromBundle } from "./behavioral.js";
import {
  analyzeSessionSentimentFromBundle,
  sentimentToSignals,
} from "./sentiment.js";
import { detectThrashingFromBundle } from "./thrashing.js";
import { detectErrorLoopsFromBundle } from "./error-loops.js";
import { detectToolInefficiencyFromBundle } from "./tool-efficiency.js";

export const collectSessionSignals = async (
  filePath: string,
  sessionId: string,
): Promise<SignalResult[]> => {
  const bundle = await loadClaudeSessionFromFilePath(filePath);
  const signals: SignalResult[] = [];

  const sentiment = analyzeSessionSentimentFromBundle(bundle, sessionId);
  signals.push(...sentimentToSignals(sentiment));
  signals.push(...detectThrashingFromBundle(bundle, sessionId));
  signals.push(...detectErrorLoopsFromBundle(bundle, sessionId));
  signals.push(...detectToolInefficiencyFromBundle(bundle, sessionId));
  signals.push(...detectBehavioralSignalsFromBundle(bundle, sessionId));

  return signals;
};
