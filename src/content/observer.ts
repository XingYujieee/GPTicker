import {
  recordObserverMutation,
  recordObserverScan
} from "./diagnostics";
import { findChatArticles, findChatMain } from "./selectors";
import { sanitizeConversationText } from "../shared/utils";
import type {
  ConversationNode,
  ConversationSnapshot,
  MessageRole
} from "../shared/types";

const PREVIEW_LIMIT = 30;
let syntheticArticleId = 0;

type SnapshotListener = (snapshot: ConversationSnapshot) => void;

export class ChatConversationObserver {
  private readonly listeners = new Set<SnapshotListener>();
  private readonly timestamps = new Map<string, number>();

  private frameId: number | null = null;
  private timeoutId: number | null = null;
  private rootObserver: MutationObserver | null = null;
  private mainObserver: MutationObserver | null = null;
  private mainElement: HTMLElement | null = null;

  subscribe(listener: SnapshotListener) {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  start() {
    this.observeDocument();
    this.attachToMain(findChatMain());
    this.scheduleScan();
  }

  stop() {
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }

    if (this.timeoutId !== null) {
      window.clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    this.rootObserver?.disconnect();
    this.mainObserver?.disconnect();
    this.rootObserver = null;
    this.mainObserver = null;
  }

  private observeDocument() {
    if (this.rootObserver) {
      return;
    }

    this.rootObserver = new MutationObserver(() => {
      recordObserverMutation("document");
      const nextMain = findChatMain();

      if (nextMain !== this.mainElement) {
        this.attachToMain(nextMain);
        return;
      }

      this.scheduleScan();
    });

    this.rootObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  private attachToMain(nextMain: HTMLElement | null) {
    if (nextMain === this.mainElement) {
      return;
    }

    this.mainObserver?.disconnect();
    this.mainObserver = null;
    this.mainElement = nextMain;

    if (!nextMain) {
      this.emit({ nodes: [], elements: new Map() });
      return;
    }

    this.mainObserver = new MutationObserver(() => {
      recordObserverMutation("main");
      this.scheduleScan();
    });

    this.mainObserver.observe(nextMain, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  private scheduleScan() {
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
    }

    if (this.timeoutId !== null) {
      window.clearTimeout(this.timeoutId);
    }

    this.frameId = requestAnimationFrame(() => {
      this.flushScheduledScan();
    });
    // Background tabs can throttle requestAnimationFrame aggressively.
    this.timeoutId = window.setTimeout(() => {
      this.flushScheduledScan();
    }, 220);
  }

  private flushScheduledScan() {
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }

    if (this.timeoutId !== null) {
      window.clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    this.scanArticles();
  }

  private scanArticles() {
    const scope = this.mainElement ?? document;
    const elements = new Map<string, HTMLElement>();
    const nodes = findChatArticles(scope).map((article, index) => {
      const id = resolveArticleId(article);
      const timestamp = this.timestamps.get(id) ?? Date.now() + index;

      this.timestamps.set(id, timestamp);
      elements.set(id, article);
      const content = extractTextContent(article);

      const node: ConversationNode = {
        id,
        text: extractPreview(content),
        content,
        role: inferRole(article),
        timestamp,
        charCount: content.length
      };

      return node;
    });

    recordObserverScan(nodes.length);
    this.emit({ nodes, elements });
  }

  private emit(snapshot: ConversationSnapshot) {
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

function resolveArticleId(article: HTMLElement) {
  const existingId =
    article.dataset.gptickerId || article.getAttribute("id") || "";

  if (existingId) {
    article.dataset.gptickerId = existingId;
    return existingId;
  }

  syntheticArticleId += 1;
  const generatedId = `gpticker-article-${syntheticArticleId}`;
  article.dataset.gptickerId = generatedId;
  return generatedId;
}

function extractPreview(text: string) {
  return text.slice(0, PREVIEW_LIMIT);
}

function extractTextContent(article: HTMLElement) {
  return sanitizeConversationText(article.innerText);
}

function inferRole(article: HTMLElement): MessageRole {
  const rawRole =
    article.getAttribute("data-message-author-role") ||
    article.closest<HTMLElement>("[data-message-author-role]")?.getAttribute(
      "data-message-author-role"
    ) ||
    article.querySelector<HTMLElement>("[data-message-author-role]")?.getAttribute(
      "data-message-author-role"
    ) ||
    article.getAttribute("data-testid") ||
    "";

  const role = rawRole.toLowerCase();

  if (role.includes("user")) {
    return "user";
  }

  if (role.includes("assistant")) {
    return "assistant";
  }

  return "unknown";
}
