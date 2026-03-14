import { useEffect, useState } from "react";
import type {
  ConversationNode,
  HoverPreviewPayload,
  MinimapMode
} from "../../shared/types";
import { sanitizeConversationText } from "../../shared/utils";

interface MinimapDotsProps {
  nodes: ConversationNode[];
  activeId: string | null;
  mode: MinimapMode;
  prefersDark?: boolean;
  variant?: "compact" | "expanded";
  matchingNodeIds: ReadonlySet<string> | null;
  keywordIntensity: ReadonlyMap<string, number>;
  onPreviewChange?: (preview: HoverPreviewPayload | null) => void;
  onSelect: (id: string) => void;
}

export function MinimapDots({
  nodes,
  activeId,
  mode,
  prefersDark = true,
  variant = "compact",
  matchingNodeIds,
  keywordIntensity,
  onPreviewChange,
  onSelect
}: MinimapDotsProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const isExpanded = variant === "expanded";

  useEffect(() => {
    return () => {
      onPreviewChange?.(null);
    };
  }, [onPreviewChange]);

  if (nodes.length === 0) {
    return (
      <div
        className={[
          "flex h-full items-center justify-center px-2 text-center text-[10px] uppercase tracking-[0.28em]",
          prefersDark ? "text-slate-500" : "text-slate-500"
        ].join(" ")}
      >
        等待
      </div>
    );
  }

  const maxCharCount = Math.max(1, ...nodes.map((node) => node.charCount));

  return (
    <div
      className={[
        "flex h-full flex-col items-center overflow-y-auto",
        isExpanded ? "gap-2.5 px-3 py-4" : "gap-2 px-2 py-3"
      ].join(" ")}
    >
      {nodes.map((node, index) => {
        const isActive = node.id === activeId;
        const isHovered = node.id === hoveredId;
        const charIntensity = node.charCount / maxCharCount;
        const keywordGlow = keywordIntensity.get(node.id) ?? 0;
        const matchesKeyword =
          matchingNodeIds === null ? true : matchingNodeIds.has(node.id);
        const backgroundColor = getNodeColor(node.role, charIntensity);
        const borderColor = getNodeBorder(node.role, charIntensity);
        const boxShadow = buildDotShadow({
          isActive,
          isHovered,
          role: node.role,
          keywordGlow,
          matchesKeyword
        });

        return (
          <button
            key={node.id}
            type="button"
            aria-label={buildAriaLabel(node, index, mode)}
            onClick={() => onSelect(node.id)}
            onMouseEnter={(event) => {
              setHoveredId(node.id);
              onPreviewChange?.(buildPreviewState(event.currentTarget, node, index));
            }}
            onMouseLeave={() => {
              setHoveredId((current) => (current === node.id ? null : current));
              onPreviewChange?.(null);
            }}
            onFocus={(event) => {
              setHoveredId(node.id);
              onPreviewChange?.(buildPreviewState(event.currentTarget, node, index));
            }}
            onBlur={() => {
              setHoveredId((current) => (current === node.id ? null : current));
              onPreviewChange?.(null);
            }}
            className={[
              "shrink-0 border transition duration-150 hover:scale-110",
              isExpanded ? "h-4.5 w-4.5" : "h-3.5 w-3.5",
              node.role === "user" ? "rounded-[4px]" : "rounded-full"
            ].join(" ")}
            style={{
              opacity: matchesKeyword ? 1 : 0.28,
              backgroundColor,
              borderColor,
              boxShadow,
              transform: isActive ? "scale(1.25)" : undefined
            }}
          />
        );
      })}
    </div>
  );
}

function buildPreviewState(
  target: HTMLButtonElement,
  node: ConversationNode,
  index: number
): HoverPreviewPayload {
  const rect = target.getBoundingClientRect();

  return {
    kind: "message",
    text: sanitizeConversationText(node.content || node.text),
    index,
    top: rect.top + rect.height / 2,
    left: rect.left - 12
  };
}

function buildAriaLabel(
  node: ConversationNode,
  index: number,
  mode: MinimapMode
) {
  if (mode === "questions") {
    return `滚动到你的第 ${index + 1} 条提问`;
  }

  if (node.role === "assistant") {
    return `滚动到第 ${index + 1} 条回复`;
  }

  if (node.role === "user") {
    return `滚动到你的第 ${index + 1} 条提问`;
  }

  return `滚动到第 ${index + 1} 条消息`;
}

function getNodeColor(role: ConversationNode["role"], intensity: number) {
  const alpha = 0.36 + intensity * 0.64;

  switch (role) {
    case "user":
      return `rgba(52, 211, 153, ${alpha.toFixed(2)})`;
    case "assistant":
      return `rgba(103, 232, 249, ${alpha.toFixed(2)})`;
    default:
      return `rgba(203, 213, 225, ${Math.max(0.3, alpha - 0.15).toFixed(2)})`;
  }
}

function getNodeBorder(role: ConversationNode["role"], intensity: number) {
  const alpha = 0.45 + intensity * 0.42;

  switch (role) {
    case "user":
      return `rgba(16, 185, 129, ${alpha.toFixed(2)})`;
    case "assistant":
      return `rgba(56, 189, 248, ${alpha.toFixed(2)})`;
    default:
      return `rgba(148, 163, 184, ${alpha.toFixed(2)})`;
  }
}

function buildDotShadow({
  isActive,
  isHovered,
  role,
  keywordGlow,
  matchesKeyword
}: {
  isActive: boolean;
  isHovered: boolean;
  role: ConversationNode["role"];
  keywordGlow: number;
  matchesKeyword: boolean;
}) {
  const glowSpread = 2 + keywordGlow * 8;
  const glowAlpha = matchesKeyword ? 0.12 + keywordGlow * 0.35 : 0;
  const shadows = [];

  if (glowAlpha > 0) {
    shadows.push(
      `0 0 ${glowSpread.toFixed(1)}px rgba(103, 232, 249, ${glowAlpha.toFixed(2)})`
    );
  }

  if (isActive) {
    shadows.push("0 0 0 3px rgba(103, 232, 249, 0.22)");
  }

  if (isHovered) {
    shadows.push(`0 0 0 2px ${getHoverRingColor(role)}`);
  }

  return shadows.join(", ");
}

function getHoverRingColor(role: ConversationNode["role"]) {
  switch (role) {
    case "user":
      return "rgba(52, 211, 153, 0.34)";
    case "assistant":
      return "rgba(103, 232, 249, 0.32)";
    default:
      return "rgba(148, 163, 184, 0.28)";
  }
}
