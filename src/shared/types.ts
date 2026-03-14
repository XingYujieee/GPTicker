export type MessageRole = "user" | "assistant" | "unknown";
export type MinimapMode = "questions" | "all";
export type KnowledgeViewMode = "2d" | "3d";
export type KeywordVisualKind = "core" | "code" | "concept" | "general";

export interface ConversationNode {
  id: string;
  text: string;
  content: string;
  role: MessageRole;
  timestamp: number;
  charCount: number;
}

export interface ConversationSnapshot {
  nodes: ConversationNode[];
  elements: Map<string, HTMLElement>;
}

export interface KeywordPointMeta {
  term: string;
  count: number;
  index: number;
  cluster: number;
  cooccurrence: number;
  accent: boolean;
  kind: KeywordVisualKind;
}

export interface KeywordPointLink {
  from: number;
  to: number;
  weight: number;
}

export interface KeywordPointCloudData {
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  indices: Float32Array;
  active: Float32Array;
  accent: Float32Array;
  meta: KeywordPointMeta[];
  links: KeywordPointLink[];
}

export interface HoverPreviewPayload {
  kind: "message" | "keyword";
  text: string;
  label?: string;
  index: number;
  top: number;
  left: number;
}

export interface PromptVaultItem {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface PromptVaultDraft {
  id?: string;
  title: string;
  content: string;
  tags: string[];
}

export interface KeywordDatum {
  term: string;
  count: number;
}

export type SelectorTarget = "main" | "promptInput";

export interface SelectorHealthState {
  degraded: boolean;
  missingTargets: SelectorTarget[];
  checkedAt: number;
  debugEnabled: boolean;
}

export type PromptAction = "filled" | "sent" | "copied";

export type PromptActionReason =
  | "prompt-input-not-found"
  | "send-button-not-found"
  | "send-button-disabled"
  | "clipboard-unavailable";

export interface PromptActionResult {
  ok: boolean;
  action: PromptAction;
  reason?: PromptActionReason;
}

export interface MarkdownExportResult {
  ok: boolean;
  filename?: string;
  reason?: string;
}

export interface SessionMetadata {
  sessionKey: string;
  title: string;
  tags: string[];
  url: string;
  updatedAt: number;
}

export interface FloatingPanelPosition {
  top: number;
  left: number;
}

export interface GPTickerUIState {
  minimized: boolean;
  position: FloatingPanelPosition;
}

export interface GPTickerState {
  nodes: ConversationNode[];
  activeId: string | null;
  activeKeywords: string[];
  drawerOpen: boolean;
  ui: GPTickerUIState;
  prompts: PromptVaultItem[];
  session: SessionMetadata;
  selectorHealth: SelectorHealthState;
}
