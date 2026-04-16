interface ContentBlock {
  type: string;
}

type FrontendId = "claude" | "codex" | "opencode" | "gemini";

interface TextBlock extends ContentBlock {
  type: "text";
  text: string;
}

interface ThinkingBlock extends ContentBlock {
  type: "thinking";
  thinking: string;
}

interface ToolUseBlock extends ContentBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ToolResultBlock extends ContentBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string | Array<{ type: string; text?: string }>;
  is_error?: boolean;
}

interface UserMessage {
  role: "user";
  content: string | Array<ToolResultBlock | ContentBlock>;
}

interface AssistantMessage {
  role: "assistant";
  model?: string;
  id?: string;
  type?: "message";
  content: Array<TextBlock | ThinkingBlock | ToolUseBlock>;
  stop_reason?: string | null;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

interface BaseEvent {
  type: string;
  sessionId: string;
  timestamp: string;
  uuid?: string;
  parentUuid?: string | null;
  cwd?: string;
  version?: string;
  gitBranch?: string;
  entrypoint?: string;
  userType?: string;
  isSidechain?: boolean;
}

interface UserEvent extends BaseEvent {
  type: "user";
  message: UserMessage;
  promptId?: string;
  isMeta?: boolean;
}

interface AssistantEvent extends BaseEvent {
  type: "assistant";
  message: AssistantMessage;
  requestId?: string;
}

interface QueueOperationEvent extends BaseEvent {
  type: "queue-operation";
  operation: "enqueue" | "dequeue";
  content?: string;
}

type TranscriptEvent =
  | UserEvent
  | AssistantEvent
  | QueueOperationEvent
  | BaseEvent;

interface SessionMetadata {
  sessionId: string;
  projectPath: string;
  projectName: string;
  filePath: string;
  startTime: Date;
  endTime: Date;
  userMessageCount: number;
  assistantMessageCount: number;
  toolCallCount: number;
  toolErrorCount: number;
  interruptCount: number;
}

interface ProjectMetadata {
  projectPath: string;
  projectName: string;
  sessions: SessionMetadata[];
  totalSessions: number;
}

interface DiscoveryLocation {
  frontendId: FrontendId;
  rootPath: string;
  exists: boolean;
  projectDirectoriesDiscovered: number;
  matchingProjectDirectories: number;
  sessionFilesDiscovered: number;
  matchingSessionFiles: number;
  loadedSessionFiles: number;
  failedSessionFiles: number;
}

interface DiscoveryReport {
  projectFilter?: string;
  locations: DiscoveryLocation[];
  warnings: string[];
}

interface IndexedProjectsResult {
  projects: ProjectMetadata[];
  discovery: DiscoveryReport;
}

interface LatestSessionLookup {
  session?: {
    filePath: string;
    sessionId: string;
  };
  discovery: DiscoveryReport;
}

interface SignalResult {
  signalName: string;
  severity: "critical" | "high" | "medium" | "low";
  score: number;
  details: string;
  sessionId?: string;
  examples?: string[];
}

interface AnalysisReport {
  generatedAt: Date;
  totalSessions: number;
  totalProjects: number;
  projects: ProjectAnalysis[];
  topSignals: SignalResult[];
  suggestions: string[];
  discovery?: DiscoveryReport;
}

interface ProjectAnalysis {
  projectName: string;
  projectPath: string;
  sessionCount: number;
  signals: SignalResult[];
  overallScore: number;
}

interface SentimentScore {
  score: number;
  comparative: number;
  positive: string[];
  negative: string[];
  message: string;
}

interface SessionSentiment {
  sessionId: string;
  averageScore: number;
  worstScore: number;
  messageScores: SentimentScore[];
  interruptCount: number;
  frustrationMessages: string[];
}

interface ToolUseEntry {
  name: string;
  input: Record<string, unknown>;
  id: string;
}

interface SessionTimeRange {
  start: Date;
  end: Date;
}

type NormalizedRole = "user" | "assistant";

type NormalizedEventKind =
  | "user-message"
  | "assistant-message"
  | "assistant-reasoning"
  | "tool-call"
  | "tool-result"
  | "interrupt"
  | "meta";

interface ProjectReference {
  frontendId: FrontendId;
  projectId: string;
  projectPath: string;
  projectName: string;
  sourcePath?: string;
}

interface SessionReference {
  frontendId: FrontendId;
  sessionId: string;
  projectId: string;
  projectPath: string;
  projectName: string;
  sourcePath: string;
}

interface NormalizedToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface NormalizedToolResult {
  toolCallId?: string;
  outputText?: string;
  isError: boolean;
}

interface NormalizedEvent {
  id: string;
  sourceEventId?: string;
  sessionId: string;
  timestamp: Date;
  kind: NormalizedEventKind;
  role?: NormalizedRole;
  text?: string;
  parentId?: string | null;
  isMeta: boolean;
  isEventMeta?: boolean;
  rawType?: string;
  pathHints: string[];
  toolCall?: NormalizedToolCall;
  toolResult?: NormalizedToolResult;
}

interface NormalizedMessageView {
  id: string;
  role: NormalizedRole;
  kind: "message" | "reasoning" | "interrupt";
  text: string;
  timestamp: Date;
  isMeta: boolean;
}

interface NormalizedToolCallEvent {
  id: string;
  timestamp: Date;
  name: string;
  arguments: Record<string, unknown>;
  pathHints: string[];
}

interface NormalizedToolResultEvent {
  id: string;
  timestamp: Date;
  toolCallId?: string;
  outputText?: string;
  isError: boolean;
}

interface NormalizedInterruptEvent {
  id: string;
  timestamp: Date;
  text?: string;
}

interface NormalizedSessionViews {
  messages: NormalizedMessageView[];
  toolCalls: NormalizedToolCallEvent[];
  toolResults: NormalizedToolResultEvent[];
  interrupts: NormalizedInterruptEvent[];
}

interface NormalizedSessionSummary {
  userMessageCount: number;
  assistantMessageCount: number;
  toolCallCount: number;
  toolErrorCount: number;
  interruptCount: number;
}

interface NormalizedSession {
  frontendId: FrontendId;
  sessionId: string;
  projectId: string;
  projectPath: string;
  projectName: string;
  sourcePath: string;
  cwd?: string;
  startedAt: Date;
  endedAt: Date;
  events: NormalizedEvent[];
}

interface NormalizedSessionBundle {
  session: NormalizedSession;
  views: NormalizedSessionViews;
  summary: NormalizedSessionSummary;
}

interface TranscriptAdapter {
  readonly frontendId: FrontendId;
  loadSession(session: SessionReference): Promise<NormalizedSessionBundle>;
}

interface SignalAggregation {
  signalName: string;
  count: number;
  totalScore: number;
  worstScore: number;
  affectedProjects: string[];
}

interface ProjectProfile {
  projectPath: string;
  sessionCount: number;
  overallScore: number;
  signalFrequency: Record<string, number>;
  topIssues: string[];
  suggestions: string[];
}

interface SavedModel {
  version: number;
  savedAt: string;
  totalSessions: number;
  totalProjects: number;
  signalBaselines: Record<string, number>;
  projects: ProjectProfile[];
  globalSuggestions: string[];
}

interface CheckResult {
  sessionId: string;
  isHealthy: boolean;
  activeSignals: SignalResult[];
  guidance: string[];
}

interface AbandonmentCluster {
  sessionIds: string[];
  windowMs: number;
  startTime: Date;
}

interface FileEditCount {
  filePath: string;
  editCount: number;
  toolNames: string[];
}

interface ErrorSequence {
  toolName: string;
  consecutiveFailures: number;
  errorSnippets: string[];
}

interface TimestampedUserMessage {
  content: string;
  timestamp: number;
  index: number;
}

interface ConversationTurn {
  type: "user" | "assistant";
  timestamp: number;
  contentLength: number;
  isToolResult: boolean;
  isInterrupt: boolean;
  content?: string;
}

interface TurnHealth {
  index: number;
  type: "user" | "assistant" | "tool-error" | "interrupt";
  health: "green" | "yellow" | "red";
  reason?: string;
  snippet?: string;
}

interface SessionTimeline {
  turns: TurnHealth[];
  healthPercentage: number;
  summary: string;
}
