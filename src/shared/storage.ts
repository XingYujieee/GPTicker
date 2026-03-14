import { uniqueTags } from "./tags";
import type {
  GPTickerUIState,
  PromptVaultDraft,
  PromptVaultItem,
  SessionMetadata
} from "./types";

const PROMPT_VAULT_KEY = "gpticker.prompt-vault";
const SESSION_LIBRARY_KEY = "gpticker.session-library";
const UI_STATE_KEY = "gpticker.ui-state";

function hasChromeStorage() {
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
}

export async function loadPromptVault(): Promise<PromptVaultItem[]> {
  if (!hasChromeStorage()) {
    return [];
  }

  const result = await chrome.storage.local.get(PROMPT_VAULT_KEY);
  const items = result[PROMPT_VAULT_KEY];

  return Array.isArray(items)
    ? sortPromptVaultItems(
        (items as PromptVaultItem[]).map((item) => normalizePromptVaultItem(item))
      )
    : [];
}

export async function savePromptVault(items: PromptVaultItem[]) {
  if (!hasChromeStorage()) {
    return;
  }

  await chrome.storage.local.set({
    [PROMPT_VAULT_KEY]: sortPromptVaultItems(items)
  });
}

export function upsertPromptVaultItem(
  items: PromptVaultItem[],
  draft: PromptVaultDraft
) {
  const title = draft.title.trim();
  const content = draft.content.trim();
  const tags = uniqueTags(draft.tags);
  const existing = draft.id
    ? items.find((item) => item.id === draft.id) ?? null
    : null;
  const now = Date.now();
  const nextItem: PromptVaultItem = {
    id: existing?.id ?? createPromptVaultId(),
    title,
    content,
    tags,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };

  return sortPromptVaultItems([
    ...items.filter((item) => item.id !== nextItem.id),
    nextItem
  ]);
}

export function deletePromptVaultItem(items: PromptVaultItem[], id: string) {
  return sortPromptVaultItems(items.filter((item) => item.id !== id));
}

export async function loadSessionMetadata(
  sessionKey: string,
  fallbackTitle: string,
  fallbackUrl: string
): Promise<SessionMetadata> {
  if (!hasChromeStorage()) {
    return createDefaultSessionMetadata(sessionKey, fallbackTitle, fallbackUrl);
  }

  const result = await chrome.storage.local.get(SESSION_LIBRARY_KEY);
  const library = normalizeSessionLibrary(result[SESSION_LIBRARY_KEY]);
  const existing = library[sessionKey];

  if (!existing) {
    return createDefaultSessionMetadata(sessionKey, fallbackTitle, fallbackUrl);
  }

  return {
    sessionKey,
    title: existing.title || fallbackTitle,
    tags: uniqueTags(existing.tags ?? []),
    url: existing.url || fallbackUrl,
    updatedAt: existing.updatedAt || 0
  };
}

export async function saveSessionMetadata(metadata: SessionMetadata) {
  if (!hasChromeStorage()) {
    return;
  }

  const result = await chrome.storage.local.get(SESSION_LIBRARY_KEY);
  const library = normalizeSessionLibrary(result[SESSION_LIBRARY_KEY]);

  library[metadata.sessionKey] = {
    ...metadata,
    tags: uniqueTags(metadata.tags)
  };

  await chrome.storage.local.set({
    [SESSION_LIBRARY_KEY]: library
  });
}

export async function loadUIState(
  fallback: GPTickerUIState
): Promise<GPTickerUIState> {
  if (!hasChromeStorage()) {
    return fallback;
  }

  const result = await chrome.storage.local.get(UI_STATE_KEY);
  return normalizeUIState(result[UI_STATE_KEY], fallback);
}

export async function saveUIState(state: GPTickerUIState) {
  if (!hasChromeStorage()) {
    return;
  }

  await chrome.storage.local.set({
    [UI_STATE_KEY]: normalizeUIState(state, state)
  });
}

function sortPromptVaultItems(items: PromptVaultItem[]) {
  return [...items].sort((left, right) => right.updatedAt - left.updatedAt);
}

function normalizePromptVaultItem(item: PromptVaultItem) {
  return {
    ...item,
    tags: Array.isArray(item.tags) ? uniqueTags(item.tags) : []
  };
}

function normalizeSessionLibrary(value: unknown) {
  if (!value || typeof value !== "object") {
    return {} as Record<string, SessionMetadata>;
  }

  return value as Record<string, SessionMetadata>;
}

function createDefaultSessionMetadata(
  sessionKey: string,
  title: string,
  url: string
): SessionMetadata {
  return {
    sessionKey,
    title,
    tags: [],
    url,
    updatedAt: 0
  };
}

function normalizeUIState(
  value: unknown,
  fallback: GPTickerUIState
): GPTickerUIState {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const candidate = value as Partial<GPTickerUIState>;
  const position = candidate.position;

  return {
    minimized:
      typeof candidate.minimized === "boolean"
        ? candidate.minimized
        : fallback.minimized,
    position: {
      top:
        typeof position?.top === "number" && Number.isFinite(position.top)
          ? position.top
          : fallback.position.top,
      left:
        typeof position?.left === "number" && Number.isFinite(position.left)
          ? position.left
          : fallback.position.left
    }
  };
}

function createPromptVaultId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `gpticker-prompt-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
