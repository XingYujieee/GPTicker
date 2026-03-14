import type { ConversationNode, SessionMetadata } from "../shared/types";

export function getCurrentSessionKey() {
  const path = window.location.pathname || "/";
  const search = window.location.search || "";

  return `${path}${search}`;
}

export function getCurrentSessionUrl() {
  return window.location.href;
}

export function getCurrentSessionTitle(nodes: ConversationNode[] = []) {
  const title = sanitizeDocumentTitle(document.title);

  if (title) {
    return title;
  }

  const firstUserMessage = nodes.find((node) => node.role === "user")?.text;

  if (firstUserMessage) {
    return firstUserMessage;
  }

  return "ChatGPT Conversation";
}

export function createDefaultSessionState(
  nodes: ConversationNode[] = []
): SessionMetadata {
  return {
    sessionKey: getCurrentSessionKey(),
    title: getCurrentSessionTitle(nodes),
    tags: [],
    url: getCurrentSessionUrl(),
    updatedAt: 0
  };
}

function sanitizeDocumentTitle(rawTitle: string) {
  return rawTitle
    .replace(/\s*-\s*ChatGPT\s*$/i, "")
    .replace(/^\s*ChatGPT\s*$/i, "")
    .trim();
}
