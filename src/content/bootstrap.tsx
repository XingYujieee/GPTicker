import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import shadowCss from "./styles/tailwind.css?inline";
import { copyPromptText, injectToChat } from "./chat-actions";
import { getGPTickerDiagnosticsSnapshot } from "./diagnostics";
import { exportConversationToMarkdown } from "./export-markdown";
import { ChatConversationObserver } from "./observer";
import { SelectorHealthCheck } from "./selector-health";
import {
  createDefaultSessionState,
  getCurrentSessionKey,
  getCurrentSessionTitle,
  getCurrentSessionUrl
} from "./session";
import { ArticleViewportObserver } from "./viewport";
import {
  loadPromptVault,
  loadSessionMetadata,
  loadUIState,
  savePromptVault,
  saveSessionMetadata,
  saveUIState
} from "../shared/storage";
import type {
  FloatingPanelPosition,
  ConversationSnapshot,
  GPTickerState,
  MarkdownExportResult,
  PromptActionResult,
  PromptVaultItem,
  SelectorHealthState
} from "../shared/types";
import { App } from "../ui/App";

const HOST_ID = "gpticker-host";
const MOUNT_ID = "gpticker-app";
const DIAGNOSTIC_UPDATE_INTERVAL_MS = 1000;
const MIN_SCROLL_ANCHOR_OFFSET = 80;
const MAX_SCROLL_ANCHOR_OFFSET = 168;
const SCROLL_ANCHOR_GAP = 20;

declare global {
  interface Window {
    __GPTICKER_BOOTSTRAPPED__?: boolean;
  }
}

type Listener = () => void;

export class GPTickerController {
  private readonly listeners = new Set<Listener>();
  private readonly conversationObserver = new ChatConversationObserver();
  private readonly selectorHealthCheck = new SelectorHealthCheck((selectorHealth) => {
    this.patchState({ selectorHealth });
  });
  private readonly viewportObserver = new ArticleViewportObserver((activeId) => {
    this.patchState({ activeId });
  });

  private articleElements = new Map<string, HTMLElement>();
  private sessionPollId: number | null = null;
  private diagnosticsPollId: number | null = null;
  private sessionRequestId = 0;
  private state: GPTickerState = {
    nodes: [],
    activeId: null,
    activeKeywords: [],
    drawerOpen: false,
    ui: createDefaultUIState(),
    prompts: [],
    session: createDefaultSessionState(),
    selectorHealth: createDefaultSelectorHealthState()
  };

  constructor() {
    this.conversationObserver.subscribe((snapshot) => {
      this.handleConversationSnapshot(snapshot);
    });
  }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.state;

  async start() {
    const session = await loadSessionMetadata(
      getCurrentSessionKey(),
      getCurrentSessionTitle(),
      getCurrentSessionUrl()
    );
    const prompts = await loadPromptVault();
    const ui = await loadUIState(createDefaultUIState());

    this.patchState({
      prompts,
      session,
      ui
    });

    this.conversationObserver.start();
    this.selectorHealthCheck.start();
    this.startSessionPolling();
    this.startDiagnosticsPolling();
  }

  stop() {
    this.conversationObserver.stop();
    this.viewportObserver.disconnect();
    this.selectorHealthCheck.stop();
    this.stopSessionPolling();
    this.stopDiagnosticsPolling();
  }

  scrollToNode = (id: string) => {
    const article = this.articleElements.get(id);

    if (!article) {
      return;
    }

    scrollArticleToAnchor(article);
    this.patchState({ activeId: id });
    window.setTimeout(() => {
      flashArticle(article);
    }, 180);
  };

  toggleDrawer = () => {
    this.patchState({ drawerOpen: !this.state.drawerOpen });
  };

  setMinimized = async (minimized: boolean) => {
    const ui = {
      ...this.state.ui,
      minimized
    };

    this.patchState({ ui });
    await saveUIState(ui);
  };

  persistPanelPosition = async (position: FloatingPanelPosition) => {
    const ui = {
      ...this.state.ui,
      position
    };

    this.patchState({ ui });
    await saveUIState(ui);
  };

  persistPromptVault = async (prompts: PromptVaultItem[]) => {
    await savePromptVault(prompts);
    this.patchState({ prompts });
  };

  applyPrompt = async (text: string, autoSend = false) => {
    return injectToChat(text, { autoSend });
  };

  copyPrompt = async (text: string): Promise<PromptActionResult> => {
    return copyPromptText(text);
  };

  toggleKeywordFilter = (keyword: string) => {
    const nextKeywords = this.state.activeKeywords.includes(keyword)
      ? this.state.activeKeywords.filter((item) => item !== keyword)
      : [...this.state.activeKeywords, keyword];

    this.patchState({
      activeKeywords: nextKeywords
    });
  };

  clearKeywordFilter = () => {
    if (this.state.activeKeywords.length === 0) {
      return;
    }

    this.patchState({ activeKeywords: [] });
  };

  persistSessionTags = async (tags: string[]) => {
    const session = {
      ...this.state.session,
      title: getCurrentSessionTitle(this.state.nodes),
      url: getCurrentSessionUrl(),
      tags,
      updatedAt: Date.now()
    };

    await saveSessionMetadata(session);
    this.patchState({ session });
  };

  exportConversation = async (): Promise<MarkdownExportResult> => {
    const session = {
      ...this.state.session,
      title: getCurrentSessionTitle(this.state.nodes),
      url: getCurrentSessionUrl()
    };
    const result = exportConversationToMarkdown({
      nodes: this.state.nodes,
      elements: this.articleElements,
      session
    });

    if (result.ok) {
      this.patchState({ session });
    }

    return result;
  };

  private handleConversationSnapshot(snapshot: ConversationSnapshot) {
    this.articleElements = snapshot.elements;
    this.viewportObserver.observe(snapshot.elements);
    this.patchState({
      nodes: snapshot.nodes,
      session: {
        ...this.state.session,
        title: getCurrentSessionTitle(snapshot.nodes),
        url: getCurrentSessionUrl()
      },
      activeId: snapshot.nodes.some((node) => node.id === this.state.activeId)
        ? this.state.activeId
        : null
    });
  }

  private startSessionPolling() {
    if (this.sessionPollId !== null) {
      return;
    }

    this.syncSessionState();
    this.sessionPollId = window.setInterval(() => {
      void this.syncSessionState();
    }, 1200);
  }

  private stopSessionPolling() {
    if (this.sessionPollId !== null) {
      window.clearInterval(this.sessionPollId);
      this.sessionPollId = null;
    }
  }

  private async syncSessionState() {
    const sessionKey = getCurrentSessionKey();
    const title = getCurrentSessionTitle(this.state.nodes);
    const url = getCurrentSessionUrl();

    if (sessionKey !== this.state.session.sessionKey) {
      const requestId = ++this.sessionRequestId;
      const session = await loadSessionMetadata(sessionKey, title, url);

      if (requestId !== this.sessionRequestId) {
        return;
      }

      this.patchState({
        session,
        activeKeywords: []
      });
      return;
    }

    if (title !== this.state.session.title || url !== this.state.session.url) {
      this.patchState({
        session: {
          ...this.state.session,
          title,
          url
        }
      });
    }
  }

  private startDiagnosticsPolling() {
    if (this.diagnosticsPollId !== null) {
      return;
    }

    publishDiagnostics();
    this.diagnosticsPollId = window.setInterval(() => {
      publishDiagnostics();
    }, DIAGNOSTIC_UPDATE_INTERVAL_MS);
  }

  private stopDiagnosticsPolling() {
    if (this.diagnosticsPollId !== null) {
      window.clearInterval(this.diagnosticsPollId);
      this.diagnosticsPollId = null;
    }
  }

  private patchState(partial: Partial<GPTickerState>) {
    this.state = { ...this.state, ...partial };
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export function bootstrapGPTicker() {
  if (window.__GPTICKER_BOOTSTRAPPED__) {
    return;
  }

  window.__GPTICKER_BOOTSTRAPPED__ = true;

  const host = ensureHost();
  const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  const mountNode = ensureMountNode(shadowRoot);
  const controller = new GPTickerController();
  const reactRoot = createRoot(mountNode);

  injectShadowStyles(shadowRoot);

  reactRoot.render(
    <StrictMode>
      <App controller={controller} />
    </StrictMode>
  );

  void controller.start();
}

function ensureHost() {
  const existingHost = document.getElementById(HOST_ID);

  if (existingHost) {
    return existingHost;
  }

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = "all: initial;";
  (document.body ?? document.documentElement).append(host);
  return host;
}

function ensureMountNode(shadowRoot: ShadowRoot) {
  const existingNode = shadowRoot.querySelector<HTMLDivElement>(`#${MOUNT_ID}`);

  if (existingNode) {
    return existingNode;
  }

  const node = document.createElement("div");
  node.id = MOUNT_ID;
  shadowRoot.append(node);
  return node;
}

function injectShadowStyles(shadowRoot: ShadowRoot) {
  const existingStyle = shadowRoot.querySelector("style[data-gpticker]");

  if (existingStyle) {
    return;
  }

  const style = document.createElement("style");
  style.dataset.gpticker = "true";
  style.textContent = shadowCss;
  shadowRoot.prepend(style);
}

function flashArticle(article: HTMLElement) {
  article.animate(
    [
      {
        backgroundColor: "rgba(56, 189, 248, 0)",
        boxShadow: "0 0 0 0 rgba(56, 189, 248, 0)"
      },
      {
        backgroundColor: "rgba(56, 189, 248, 0.18)",
        boxShadow: "0 0 0 8px rgba(56, 189, 248, 0.12)"
      },
      {
        backgroundColor: "rgba(56, 189, 248, 0)",
        boxShadow: "0 0 0 0 rgba(56, 189, 248, 0)"
      }
    ],
    {
      duration: 880,
      easing: "ease-out"
    }
  );
}

function scrollArticleToAnchor(article: HTMLElement) {
  const scroller = findScrollContainer(article);
  const anchorOffset = resolveScrollAnchorOffset(scroller);
  const targetTop = resolveScrollTargetTop(article, scroller, anchorOffset);

  if (scroller === window) {
    window.scrollTo({
      top: targetTop,
      behavior: "smooth"
    });
    return;
  }

  scroller.scrollTo({
    top: targetTop,
    behavior: "smooth"
  });
}

function resolveScrollAnchorOffset(scroller: HTMLElement | Window) {
  const rootStyles = getComputedStyle(document.documentElement);
  const bodyStyles = getComputedStyle(document.body);
  const scrollPaddingTop = Math.max(
    parsePixelValue(rootStyles.scrollPaddingTop),
    parsePixelValue(bodyStyles.scrollPaddingTop)
  );
  const candidates = document.querySelectorAll<HTMLElement>(
    "header, nav, [role='banner'], [data-testid*='header'], [data-testid*='nav'], [style*='position: sticky'], [style*='position:sticky'], [style*='position: fixed'], [style*='position:fixed']"
  );
  let topInset = scrollPaddingTop;

  for (const element of candidates) {
    const styles = getComputedStyle(element);

    if (styles.display === "none" || styles.visibility === "hidden") {
      continue;
    }

    if (styles.position !== "sticky" && styles.position !== "fixed") {
      continue;
    }

    const top = parsePixelValue(styles.top);

    if (top > 24) {
      continue;
    }

    const rect = element.getBoundingClientRect();

    if (rect.height < 24 || rect.bottom <= 0 || rect.top > 24) {
      continue;
    }

    topInset = Math.max(topInset, rect.bottom);
  }

  const pageAnchorOffset = clamp(
    Math.max(MIN_SCROLL_ANCHOR_OFFSET, topInset + SCROLL_ANCHOR_GAP),
    MIN_SCROLL_ANCHOR_OFFSET,
    MAX_SCROLL_ANCHOR_OFFSET
  );

  if (isWindowScroller(scroller)) {
    return pageAnchorOffset;
  }

  const scrollerRect = scroller.getBoundingClientRect();

  if (scrollerRect.top > 24) {
    return 16;
  }

  return clamp(
    pageAnchorOffset - Math.max(0, scrollerRect.top),
    16,
    pageAnchorOffset
  );
}

function resolveScrollTargetTop(
  article: HTMLElement,
  scroller: HTMLElement | Window,
  anchorOffset: number
) {
  if (isWindowScroller(scroller)) {
    return Math.max(
      0,
      window.scrollY + article.getBoundingClientRect().top - anchorOffset
    );
  }

  const articleRect = article.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();

  return Math.max(
    0,
    scroller.scrollTop + articleRect.top - scrollerRect.top - anchorOffset
  );
}

function findScrollContainer(article: HTMLElement): HTMLElement | Window {
  let current: HTMLElement | null = article.parentElement;

  while (current) {
    if (isScrollableContainer(current)) {
      return current;
    }

    current = current.parentElement;
  }

  return window;
}

function isWindowScroller(scroller: HTMLElement | Window): scroller is Window {
  return scroller === window;
}

function isScrollableContainer(element: HTMLElement) {
  const styles = getComputedStyle(element);
  const overflowY = styles.overflowY;

  if (!/(auto|scroll|overlay)/.test(overflowY)) {
    return false;
  }

  return element.scrollHeight - element.clientHeight > 4;
}

function parsePixelValue(rawValue: string) {
  const value = Number.parseFloat(rawValue);

  return Number.isFinite(value) ? value : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function createDefaultSelectorHealthState(): SelectorHealthState {
  return {
    degraded: false,
    missingTargets: [],
    checkedAt: 0,
    debugEnabled: false
  };
}

function createDefaultUIState() {
  const defaultTop = 16;
  const defaultLeft =
    typeof window === "undefined"
      ? 16
      : Math.max(12, window.innerWidth - 76);

  return {
    minimized: false,
    position: {
      top: defaultTop,
      left: defaultLeft
    }
  };
}

function publishDiagnostics() {
  const host = document.getElementById(HOST_ID);

  if (!host) {
    return;
  }

  const diagnostics = getGPTickerDiagnosticsSnapshot();
  host.setAttribute("data-gpticker-diagnostics", JSON.stringify(diagnostics));
  host.setAttribute(
    "data-gpticker-observer-scans",
    String(diagnostics.observer.scans)
  );
  host.setAttribute(
    "data-gpticker-last-node-count",
    String(diagnostics.observer.lastNodeCount)
  );
}
