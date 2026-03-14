import { extractKeywords } from "../shared/utils";
import { formatTagLabel } from "../shared/tags";
import type {
  ConversationNode,
  MarkdownExportResult,
  SessionMetadata
} from "../shared/types";

interface ExportConversationOptions {
  nodes: ConversationNode[];
  elements: Map<string, HTMLElement>;
  session: SessionMetadata;
}

export function exportConversationToMarkdown({
  nodes,
  elements,
  session
}: ExportConversationOptions): MarkdownExportResult {
  if (nodes.length === 0) {
    return {
      ok: false,
      reason: "当前没有可导出的对话内容。"
    };
  }

  const keywords = extractKeywords(nodes, 12);
  const exportedAt = new Date();
  const yaml = buildFrontmatter(session, keywords.map((keyword) => keyword.term), exportedAt);
  const sections = nodes.map((node, index) => {
    const element = elements.get(node.id) ?? null;
    const roleTitle =
      node.role === "user"
        ? "User"
        : node.role === "assistant"
          ? "Assistant"
          : `Message ${index + 1}`;
    const markdown = element ? serializeNodeChildren(element).trim() : fallbackMarkdown(node.content);

    return `## ${roleTitle}\n\n${markdown || fallbackMarkdown(node.content)}`;
  });
  const documentTitle = session.title || "ChatGPT Conversation";
  const filename = `${slugify(documentTitle)}-${exportedAt
    .toISOString()
    .slice(0, 10)}.md`;
  const content = `${yaml}\n# ${documentTitle}\n\n${sections.join("\n\n")}\n`;

  downloadMarkdownFile(content, filename);

  return {
    ok: true,
    filename
  };
}

function buildFrontmatter(
  session: SessionMetadata,
  keywords: string[],
  exportedAt: Date
) {
  const tagLines =
    session.tags.length > 0
      ? session.tags.map((tag) => `  - "${escapeYaml(formatTagLabel(tag))}"`).join("\n")
      : "  - \"ChatGPT\"";
  const keywordLines =
    keywords.length > 0
      ? keywords.map((keyword) => `  - "${escapeYaml(keyword)}"`).join("\n")
      : "  - \"conversation\"";

  return [
    "---",
    `title: "${escapeYaml(session.title)}"`,
    `date: "${exportedAt.toISOString()}"`,
    `source: "${escapeYaml(session.url)}"`,
    "tags:",
    tagLines,
    "keywords:",
    keywordLines,
    "---"
  ].join("\n");
}

function serializeNodeChildren(root: HTMLElement) {
  const blocks = Array.from(root.childNodes)
    .map((node) => serializeNode(node, { inline: false, listDepth: 0 }))
    .join("");

  return normalizeMarkdownSpacing(blocks);
}

function serializeNode(
  node: Node,
  context: { inline: boolean; listDepth: number }
): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return context.inline
      ? normalizeInlineText(node.textContent ?? "")
      : normalizeBlockText(node.textContent ?? "");
  }

  if (!(node instanceof HTMLElement)) {
    return "";
  }

  if (
    ["BUTTON", "SVG", "PATH", "STYLE", "NOSCRIPT", "IFRAME"].includes(node.tagName)
  ) {
    return "";
  }

  const tagName = node.tagName.toLowerCase();

  if (tagName === "pre") {
    return `${serializeCodeFence(node)}\n\n`;
  }

  if (tagName === "code") {
    if (node.closest("pre")) {
      return "";
    }

    return `\`${normalizeInlineText(node.innerText || node.textContent || "")}\``;
  }

  if (tagName === "br") {
    return "\n";
  }

  if (tagName === "a") {
    const label = serializeInlineChildren(node).trim() || node.getAttribute("href") || "";
    const href = node.getAttribute("href");
    return href ? `[${label}](${href})` : label;
  }

  if (tagName === "strong" || tagName === "b") {
    return wrapInline("**", serializeInlineChildren(node));
  }

  if (tagName === "em" || tagName === "i") {
    return wrapInline("*", serializeInlineChildren(node));
  }

  if (tagName === "blockquote") {
    const text = normalizeMarkdownSpacing(serializeChildren(node, context.listDepth).trim());

    return text
      .split("\n")
      .map((line) => (line ? `> ${line}` : ">"))
      .join("\n")
      .concat("\n\n");
  }

  if (/^h[1-6]$/.test(tagName)) {
    const level = Number(tagName.slice(1));
    return `${"#".repeat(level)} ${serializeInlineChildren(node).trim()}\n\n`;
  }

  if (tagName === "ul" || tagName === "ol") {
    return `${serializeList(node, tagName === "ol", context.listDepth)}\n`;
  }

  if (tagName === "li") {
    return serializeChildren(node, context.listDepth + 1);
  }

  if (tagName === "table") {
    return `${serializeTable(node)}\n\n`;
  }

  if (isBlockElement(tagName)) {
    const content = serializeChildren(node, context.listDepth).trim();

    if (!content) {
      return "";
    }

    return `${content}\n\n`;
  }

  return serializeInlineChildren(node);
}

function serializeChildren(node: HTMLElement, listDepth: number) {
  return Array.from(node.childNodes)
    .map((child) => serializeNode(child, { inline: false, listDepth }))
    .join("");
}

function serializeInlineChildren(node: HTMLElement) {
  return Array.from(node.childNodes)
    .map((child) => serializeNode(child, { inline: true, listDepth: 0 }))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function serializeList(list: HTMLElement, ordered: boolean, listDepth: number) {
  const items = Array.from(list.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement && child.tagName === "LI"
  );

  return items
    .map((item, index) => {
      const marker = ordered ? `${index + 1}. ` : "- ";
      const body = normalizeMarkdownSpacing(
        Array.from(item.childNodes)
          .map((child) => serializeNode(child, { inline: false, listDepth: listDepth + 1 }))
          .join("")
          .trim()
      );

      return `${"  ".repeat(listDepth)}${marker}${indentMultiline(body, listDepth + 1)}`;
    })
    .join("\n");
}

function serializeTable(table: HTMLElement) {
  const rows = Array.from(table.querySelectorAll("tr")).map((row) =>
    Array.from(row.querySelectorAll("th, td")).map((cell) =>
      normalizeInlineText(cell.textContent ?? "")
    )
  );

  if (rows.length === 0) {
    return "";
  }

  const [header, ...body] = rows;
  const headerRow = `| ${header.join(" | ")} |`;
  const divider = `| ${header.map(() => "---").join(" | ")} |`;
  const bodyRows = body.map((row) => `| ${row.join(" | ")} |`);

  return [headerRow, divider, ...bodyRows].join("\n");
}

function serializeCodeFence(pre: HTMLElement) {
  const codeElement = pre.querySelector("code") ?? pre;
  const code = (codeElement.textContent ?? "").replace(/\n+$/, "");
  const language = detectCodeLanguage(pre, codeElement);

  return `\`\`\`${language}\n${code}\n\`\`\``;
}

function detectCodeLanguage(pre: HTMLElement, codeElement: Element) {
  const candidates = [
    codeElement,
    pre,
    pre.previousElementSibling,
    pre.parentElement,
    pre.closest("[data-language]"),
    pre.closest("[class*='language-']")
  ].filter(Boolean) as Element[];

  for (const candidate of candidates) {
    const dataLanguage =
      candidate.getAttribute("data-language") ||
      candidate.getAttribute("data-code-language") ||
      candidate.getAttribute("aria-label");

    if (dataLanguage) {
      return sanitizeLanguage(dataLanguage);
    }

    const classMatch = candidate.className.match(/language-([a-z0-9.+_-]+)/i);

    if (classMatch?.[1]) {
      return sanitizeLanguage(classMatch[1]);
    }
  }

  return "";
}

function sanitizeLanguage(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9.+_-]/g, "");
}

function normalizeInlineText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeBlockText(text: string) {
  return text.replace(/[ \t]+\n/g, "\n").replace(/\s+/g, " ");
}

function normalizeMarkdownSpacing(text: string) {
  return text
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function wrapInline(wrapper: string, text: string) {
  const content = text.trim();
  return content ? `${wrapper}${content}${wrapper}` : "";
}

function indentMultiline(text: string, depth: number) {
  return text
    .split("\n")
    .map((line, index) => (index === 0 ? line : `${"  ".repeat(depth)}${line}`))
    .join("\n");
}

function fallbackMarkdown(content: string) {
  return content
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function isBlockElement(tagName: string) {
  return [
    "article",
    "div",
    "p",
    "section",
    "header",
    "footer",
    "main"
  ].includes(tagName);
}

function downloadMarkdownFile(content: string, filename: string) {
  const blob = new Blob([content], {
    type: "text/markdown;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

function escapeYaml(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "chatgpt-conversation";
}
