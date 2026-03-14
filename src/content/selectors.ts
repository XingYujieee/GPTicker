import { recordSelectorHit } from "./diagnostics";

export const CHAT_MAIN_SELECTOR = "main";
export const PROMPT_TEXTAREA_SELECTOR = "#prompt-textarea";

export const SELECTOR_MAP = {
  main: [
    "main",
    'main[role="main"]',
    '[role="main"]',
    '[data-testid="conversation-turns"]',
    '[data-testid*="conversation"] [role="main"]'
  ],
  article: [
    "article",
    'article[data-message-author-role]',
    'article[data-testid*="conversation"]',
    '[data-message-author-role] article'
  ],
  promptInput: [
    "#prompt-textarea",
    'form [contenteditable="true"]#prompt-textarea',
    'form [data-testid="conversation-turn-input"] [contenteditable="true"]',
    'form [contenteditable="true"][data-placeholder]',
    '[contenteditable="true"][data-placeholder*="Message"]',
    'textarea[placeholder*="Message"]',
    'form textarea',
    'textarea[placeholder]'
  ],
  sendButton: [
    'button[aria-label="发送提示"]',
    'button[aria-label="Send prompt"]',
    'button[aria-label="Send message"]',
    'button[data-testid="send-button"]',
    'form button[data-testid*="send"]',
    'button[data-testid*="send"]',
    'form button[aria-label*="Send"]'
  ]
} as const;

type SelectorMapKey = keyof typeof SELECTOR_MAP;

const DEBUG_STORAGE_KEY = "gpticker.debug";
const lastDebugState = new Map<string, string>();

export function findChatMain(root: ParentNode = document) {
  return queryFirst(root, "main");
}

export function findChatArticles(root: ParentNode = document) {
  const container = resolveArticleRoot(root);

  if (!container) {
    debugSelection("article", "missing-container", null);
    recordSelectorHit("article", null, false, 0);
    return [];
  }

  const { nodes, selector } = queryAll(container, "article");
  debugSelection("article", nodes.length > 0 ? selector ?? "fallback-list" : "none", nodes[0] ?? null);
  recordSelectorHit("article", selector, nodes.length > 0, nodes.length);
  return nodes;
}

export function findPromptTextarea(root: ParentNode = document) {
  return queryFirst(root, "promptInput");
}

export function findPromptForm(root: ParentNode = document) {
  return findPromptTextarea(root)?.closest("form") ?? root.querySelector("form");
}

export function findSendButton(root: ParentNode = document) {
  const directButton = queryFirst(root, "sendButton");

  if (directButton instanceof HTMLButtonElement) {
    return directButton;
  }

  for (const selector of [
    '[aria-label="发送提示"]',
    '[aria-label="Send prompt"]',
    '[aria-label="Send message"]'
  ]) {
    const labelledNode = root.querySelector<HTMLElement>(selector);
    const parentButton = labelledNode?.closest("button");

    if (parentButton) {
      debugSelection("sendButton", `${selector} -> parent-button`, parentButton);
      return parentButton;
    }
  }

  const promptForm = findPromptForm(root);

  if (promptForm) {
    const scopedButton = findSendButtonByHeuristic(promptForm, "scoped-heuristic");

    if (scopedButton) {
      return scopedButton;
    }
  }

  return findSendButtonByHeuristic(root, "global-heuristic");
}

export function isSelectorDebugEnabled() {
  try {
    const value = window.localStorage.getItem(DEBUG_STORAGE_KEY);
    return value === "1" || value === "true" || value === "selectors";
  } catch {
    return false;
  }
}

function queryFirst(root: ParentNode, key: SelectorMapKey) {
  for (const selector of SELECTOR_MAP[key]) {
    const node = root.querySelector<HTMLElement>(selector);

    if (node) {
      debugSelection(key, selector, node);
      recordSelectorHit(key, selector, true, 1);
      return node;
    }
  }

  debugSelection(key, "none", null);
  recordSelectorHit(key, null, false, 0);
  return null;
}

function queryAll(root: ParentNode, key: "article") {
  const nodes = new Set<HTMLElement>();
  let matchedSelector: string | null = null;

  for (const selector of SELECTOR_MAP[key]) {
    const matches = root.querySelectorAll<HTMLElement>(selector);

    if (!matchedSelector && matches.length > 0) {
      matchedSelector = selector;
    }

    for (const node of matches) {
      nodes.add(node);
    }
  }

  return {
    nodes: [...nodes],
    selector: matchedSelector
  };
}

function resolveArticleRoot(root: ParentNode) {
  if (root instanceof HTMLElement) {
    for (const selector of SELECTOR_MAP.main) {
      if (root.matches(selector)) {
        return root;
      }
    }

    return root;
  }

  return findChatMain(root);
}

function findSendButtonByHeuristic(root: ParentNode, source: string) {
  const button =
    Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((node) => {
      const fragments = [
        node.getAttribute("aria-label") ?? "",
        node.textContent ?? "",
        ...Array.from(
          node.querySelectorAll<HTMLElement>("[aria-label]"),
          (child) => child.getAttribute("aria-label") ?? ""
        )
      ];
      const signal = fragments.join(" ").toLowerCase();

      return (
        /(send|发送|submit|提交)/.test(signal) &&
        !/(stop|停止|cancel|取消)/.test(signal)
      );
    }) ?? null;

  if (button) {
    debugSelection("sendButton", source, button);
    recordSelectorHit("sendButton", source, true, 1);
  }

  return button;
}

function debugSelection(
  key: SelectorMapKey | "article",
  selector: string,
  element: Element | null
) {
  if (!isSelectorDebugEnabled()) {
    return;
  }

  const snapshot = `${selector} :: ${describeElement(element)}`;
  const previous = lastDebugState.get(key);

  if (previous === snapshot) {
    return;
  }

  lastDebugState.set(key, snapshot);
  console.info(`[GPTicker][selectors] ${key} -> ${snapshot}`);
}

function describeElement(element: Element | null) {
  if (!element) {
    return "null";
  }

  const tagName = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : "";
  const dataTestId = element.getAttribute("data-testid");
  const labelledBy = element.getAttribute("aria-label");

  if (dataTestId) {
    return `${tagName}${id}[data-testid="${dataTestId}"]`;
  }

  if (labelledBy) {
    return `${tagName}${id}[aria-label="${labelledBy}"]`;
  }

  return `${tagName}${id}`;
}
