import { useEffect, useMemo, useRef, useState } from "react";
import { GraphChart } from "echarts/charts";
import { init, use, type EChartsType } from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import {
  countKeywordOccurrences,
  getKeywordVisualKind,
  sanitizeConversationText
} from "../../shared/utils";
import type {
  ConversationNode,
  HoverPreviewPayload,
  KeywordDatum,
  KeywordVisualKind
} from "../../shared/types";

use([GraphChart, SVGRenderer]);

interface LogicGraph2DProps {
  sessionTitle: string;
  nodes: ConversationNode[];
  keywords: KeywordDatum[];
  activeKeywords: string[];
  prefersDark: boolean;
  onSelectNode: (id: string) => void;
  onToggleKeyword: (keyword: string) => void;
  onPreviewChange?: (preview: HoverPreviewPayload | null) => void;
}

type LogicNodeKind = "root" | "keyword" | "message";

interface LogicNodeDatum {
  id: string;
  name: string;
  kind: LogicNodeKind;
  category: number;
  symbolSize: number;
  value: number;
  x: number;
  y: number;
  symbol?: string;
  keyword?: string;
  messageId?: string;
  anchorMessageId?: string;
  matchCount?: number;
  summary?: string;
  itemStyle: {
    color: string;
    borderColor: string;
    borderWidth: number;
    shadowBlur?: number;
    shadowColor?: string;
  };
  label: {
    show: boolean;
    color: string;
    fontSize: number;
    fontWeight?: number | string;
    formatter?: string;
    overflow?: "truncate";
    width?: number;
  };
  emphasis: {
    label: {
      show: boolean;
      color: string;
      fontSize?: number;
      fontWeight?: number | string;
      formatter?: string;
      width?: number;
      overflow?: "break" | "truncate";
    };
    itemStyle?: {
      borderColor?: string;
      borderWidth?: number;
      shadowBlur?: number;
      shadowColor?: string;
    };
  };
}

interface LogicLinkDatum {
  source: string;
  target: string;
  value: number;
  lineStyle: {
    color: string;
    opacity: number;
    width: number;
    curveness?: number;
  };
}

interface LogicPreviewState {
  title: string;
  detail: string;
}

export function LogicGraph2D({
  sessionTitle,
  nodes,
  keywords,
  activeKeywords,
  prefersDark,
  onSelectNode,
  onToggleKeyword,
  onPreviewChange
}: LogicGraph2DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const [preview, setPreview] = useState<LogicPreviewState | null>(null);
  const graph = useMemo(
    () =>
      buildLogicGraphData(
        sessionTitle,
        nodes,
        keywords,
        activeKeywords,
        prefersDark
      ),
    [activeKeywords, keywords, nodes, prefersDark, sessionTitle]
  );

  useEffect(() => {
    onPreviewChange?.(null);
    setPreview(null);

    return () => {
      onPreviewChange?.(null);
      setPreview(null);
    };
  }, [onPreviewChange]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const chart = init(container, undefined, {
      renderer: "svg"
    });

    chartRef.current = chart;
    chart.setOption({
      backgroundColor: "transparent",
      animationDuration: 420,
      animationDurationUpdate: 260,
      series: [
        {
          type: "graph",
          layout: "none",
          roam: true,
          draggable: true,
          data: graph.nodes,
          links: graph.links,
          edgeSymbol: ["none", "none"],
          lineStyle: {
            opacity: 0.22,
            curveness: 0.14
          },
          emphasis: {
            focus: "adjacency",
            lineStyle: {
              width: 2.2,
              opacity: 0.54
            }
          }
        }
      ]
    });

    const handleClick = (params: { dataType?: string; data?: LogicNodeDatum | null }) => {
      if (params.dataType !== "node" || !params.data) {
        return;
      }

      if (params.data.kind === "keyword" && params.data.keyword) {
        onToggleKeyword(params.data.keyword);
      }
    };

    const handleDoubleClick = (params: { dataType?: string; data?: LogicNodeDatum | null }) => {
      if (params.dataType !== "node" || !params.data) {
        return;
      }

      if (params.data.kind === "message" && params.data.messageId) {
        onSelectNode(params.data.messageId);
        return;
      }

      if (params.data.kind === "keyword" && params.data.anchorMessageId) {
        onSelectNode(params.data.anchorMessageId);
      }
    };
    const handleMouseOver = (params: { dataType?: string; data?: LogicNodeDatum | null }) => {
      if (params.dataType !== "node" || !params.data) {
        return;
      }

      setPreview(buildPreviewState(params.data));
    };
    const handleMouseOut = () => {
      setPreview(null);
    };

    chart.on("click", handleClick as unknown as (params: unknown) => void);
    chart.on("dblclick", handleDoubleClick as unknown as (params: unknown) => void);
    chart.on("mouseover", handleMouseOver as unknown as (params: unknown) => void);
    chart.on("mouseout", handleMouseOut as unknown as (params: unknown) => void);
    chart.on("globalout", handleMouseOut as unknown as (params: unknown) => void);

    const resizeObserver = new ResizeObserver(() => {
      chart.resize();
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.off("click", handleClick as unknown as (params: unknown) => void);
      chart.off("dblclick", handleDoubleClick as unknown as (params: unknown) => void);
      chart.off("mouseover", handleMouseOver as unknown as (params: unknown) => void);
      chart.off("mouseout", handleMouseOut as unknown as (params: unknown) => void);
      chart.off("globalout", handleMouseOut as unknown as (params: unknown) => void);
      chart.dispose();
      chartRef.current = null;
    };
  }, [graph.links, graph.nodes, onPreviewChange, onSelectNode, onToggleKeyword]);

  return (
    <div
      className={[
        "relative h-full w-full overflow-hidden rounded-[28px] border",
        prefersDark ? "border-slate-800" : "border-slate-200"
      ].join(" ")}
    >
      {preview ? (
        <div
          className={[
            "pointer-events-none absolute inset-x-3 top-3 z-20 rounded-2xl border px-3 py-2 backdrop-blur",
            prefersDark
              ? "border-slate-700/90 bg-slate-950/92 shadow-[0_18px_36px_rgba(2,6,23,0.36)]"
              : "border-slate-200 bg-white/95 shadow-[0_18px_36px_rgba(15,23,42,0.12)]"
          ].join(" ")}
        >
          <p
            className={[
              "text-[10px] font-semibold uppercase tracking-[0.16em]",
              prefersDark ? "text-slate-400" : "text-slate-500"
            ].join(" ")}
          >
            {preview.title}
          </p>
          <p
            className={[
              "mt-1 text-[11px] leading-5",
              prefersDark ? "text-slate-100" : "text-slate-900"
            ].join(" ")}
          >
            {preview.detail}
          </p>
        </div>
      ) : null}
      <div
        ref={containerRef}
        className="h-full w-full"
        style={{
          background: prefersDark
            ? "radial-gradient(circle at 20% 16%, rgba(79,172,254,0.1), transparent 24%), radial-gradient(circle at 78% 18%, rgba(14,165,233,0.08), transparent 26%), linear-gradient(180deg, rgba(1,5,14,0.985), rgba(2,6,23,0.98))"
            : "radial-gradient(circle at 20% 16%, rgba(79,172,254,0.12), transparent 24%), radial-gradient(circle at 78% 18%, rgba(14,165,233,0.08), transparent 26%), linear-gradient(180deg, rgba(255,255,255,0.98), rgba(241,245,249,0.98))"
        }}
      />
    </div>
  );
}

function buildLogicGraphData(
  sessionTitle: string,
  nodes: ConversationNode[],
  keywords: KeywordDatum[],
  activeKeywords: string[],
  prefersDark: boolean
) {
  const rootId = "session-root";
  const topKeywords = keywords.slice(0, 8);
  const graphNodes: LogicNodeDatum[] = [];
  const graphLinks: LogicLinkDatum[] = [];
  const activeSet = new Set(activeKeywords.map((keyword) => keyword.trim().toLowerCase()));
  const maxKeywordCount = Math.max(1, ...topKeywords.map((keyword) => keyword.count));
  const keywordStep = topKeywords.length > 1 ? (Math.PI * 2) / topKeywords.length : 0;
  const keywordRadiusX = 142;
  const keywordRadiusY = 96;
  const messageNodeMap = new Map<string, LogicNodeDatum>();

  graphNodes.push({
    id: rootId,
    name: sessionTitle.trim() || "当前会话",
    kind: "root",
    category: 0,
    value: 1,
    symbol: "roundRect",
    symbolSize: 62,
    x: 0,
    y: 0,
    itemStyle: {
      color: prefersDark
        ? "rgba(2, 6, 23, 0.96)"
        : "rgba(255,255,255,0.96)",
      borderColor: prefersDark
        ? "rgba(148, 163, 184, 0.36)"
        : "rgba(14, 165, 233, 0.28)",
      borderWidth: 1.2,
      shadowBlur: 18,
      shadowColor: prefersDark
        ? "rgba(14, 165, 233, 0.14)"
        : "rgba(56, 189, 248, 0.1)"
    },
    label: {
      show: true,
      color: prefersDark ? "#f8fafc" : "#0f172a",
      fontSize: 13,
      fontWeight: 600,
      formatter: summarizeText(sessionTitle, 14),
      overflow: "truncate",
      width: 110
    },
    emphasis: {
      label: {
        show: true,
        color: prefersDark ? "#ffffff" : "#020617",
        fontSize: 13,
        fontWeight: 600,
        formatter: summarizeText(sessionTitle, 18),
        width: 130,
        overflow: "break"
      }
    }
  });

  topKeywords.forEach((keyword, keywordIndex) => {
    const angle = -Math.PI / 2 + keywordIndex * keywordStep;
    const keywordX = Math.cos(angle) * keywordRadiusX;
    const keywordY = Math.sin(angle) * keywordRadiusY;
    const kind = getKeywordVisualKind(keyword.term, keyword.count, maxKeywordCount);
    const isActive = activeSet.has(keyword.term.trim().toLowerCase());
    const matches = nodes
      .map((node) => ({
        node,
        count: countKeywordOccurrences(node.content, keyword.term)
      }))
      .filter((entry) => entry.count > 0)
      .sort((left, right) => {
        const delta = right.count - left.count;

        if (delta !== 0) {
          return delta;
        }

        return right.node.charCount - left.node.charCount;
      })
      .slice(0, topKeywords.length > 5 ? 2 : 3);
    const colors = getLogicKeywordColors(kind, isActive, prefersDark);
    const fontSize = 12 + Math.min(6, keyword.count * 1.1);
    const keywordId = `keyword:${keyword.term}`;

    graphNodes.push({
      id: keywordId,
      name: keyword.term,
      keyword: keyword.term,
      anchorMessageId: matches[0]?.node.id,
      kind: "keyword",
      category: resolveKeywordCategory(kind),
      value: keyword.count,
      symbolSize: 28 + Math.min(14, keyword.count * 2.6),
      x: keywordX,
      y: keywordY,
      itemStyle: {
        color: colors.fill,
        borderColor: colors.stroke,
        borderWidth: isActive ? 1.7 : 1.2,
        shadowBlur: isActive ? 20 : 12,
        shadowColor: colors.shadow
      },
      label: {
        show: true,
        color: colors.label,
        fontSize,
        fontWeight: 600
      },
      emphasis: {
        label: {
          show: true,
          color: prefersDark ? "#f8fafc" : "#0f172a",
          fontSize: fontSize + 1,
          fontWeight: 700
        },
        itemStyle: {
          borderColor: prefersDark ? "#f8fafc" : "#0f172a",
          borderWidth: 1.8,
          shadowBlur: 24,
          shadowColor: colors.shadow
        }
      }
    });

    graphLinks.push({
      source: rootId,
      target: keywordId,
      value: keyword.count,
      lineStyle: {
        color: colors.edge,
        opacity: 0.32,
        width: 1.3 + Math.min(1.6, keyword.count * 0.14)
      }
    });

    matches.forEach((match, matchIndex) => {
      if (!messageNodeMap.has(match.node.id)) {
        const fanSpread = matches.length === 1 ? 0 : 0.7;
        const fanOffset =
          matches.length === 1
            ? 0
            : -fanSpread / 2 + (fanSpread / (matches.length - 1)) * matchIndex;
        const radialDistance = 78 + matchIndex * 24 + Math.min(12, match.count * 2);
        const messageAngle = angle + fanOffset;
        const messageX = keywordX + Math.cos(messageAngle) * radialDistance;
        const messageY = keywordY + Math.sin(messageAngle) * radialDistance;

        messageNodeMap.set(
          match.node.id,
          buildMessageNode(match.node, match.count, messageX, messageY, prefersDark)
        );
      }

      graphLinks.push({
        source: keywordId,
        target: match.node.id,
        value: match.count,
        lineStyle: {
          color: colors.edge,
          opacity: 0.24 + match.count * 0.04,
          width: 0.9 + Math.min(1.4, match.count * 0.22),
          curveness: 0.08
        }
      });
    });
  });

  return {
    nodes: [...graphNodes, ...messageNodeMap.values()],
    links: graphLinks
  };
}

function buildMessageNode(
  node: ConversationNode,
  keywordCount: number,
  x: number,
  y: number,
  prefersDark: boolean
): LogicNodeDatum {
  const summary = summarizeText(node.content || node.text, 50);
  const isCodeHeavy = /```|`[^`]+`|\bfunction\b|\bclass\b|\bconst\b|\bimport\b|\bexport\b/.test(
    node.content
  );
  const fill = isCodeHeavy
    ? prefersDark
      ? "rgba(249,115,22,0.9)"
      : "rgba(234,88,12,0.86)"
    : node.role === "assistant"
      ? prefersDark
        ? "rgba(0,242,254,0.88)"
        : "rgba(8,145,178,0.84)"
      : prefersDark
        ? "rgba(37,99,235,0.82)"
        : "rgba(37,99,235,0.78)";

  return {
    id: node.id,
    name: summary,
    messageId: node.id,
    summary,
    matchCount: keywordCount,
    kind: "message",
    category: 5,
    value: keywordCount,
    symbolSize: 14 + Math.min(10, keywordCount * 2.1),
    x,
    y,
    itemStyle: {
      color: fill,
      borderColor: prefersDark
        ? "rgba(226, 232, 240, 0.24)"
        : "rgba(15, 23, 42, 0.12)",
      borderWidth: 0.9,
      shadowBlur: isCodeHeavy ? 16 : 9,
      shadowColor: isCodeHeavy ? "rgba(249,115,22,0.18)" : "rgba(14,165,233,0.12)"
    },
    label: {
      show: false,
      color: prefersDark ? "#e2e8f0" : "#334155",
      fontSize: 10
    },
    emphasis: {
      label: {
        show: false,
        color: prefersDark ? "#f8fafc" : "#0f172a",
        fontSize: 11,
        formatter: summary,
        width: 120,
        overflow: "break"
      },
      itemStyle: {
        borderColor: prefersDark ? "#f8fafc" : "#0f172a",
        borderWidth: 1.2,
        shadowBlur: 18,
        shadowColor: prefersDark
          ? "rgba(248,250,252,0.16)"
          : "rgba(15,23,42,0.12)"
      }
    }
  };
}

function getLogicKeywordColors(
  kind: KeywordVisualKind,
  active: boolean,
  prefersDark: boolean
) {
  if (!prefersDark) {
    if (kind === "core") {
      return {
        fill: active ? "rgba(251,191,36,0.28)" : "rgba(254,240,138,0.82)",
        stroke: "rgba(217,119,6,0.72)",
        label: "#92400e",
        edge: "rgba(245,158,11,0.24)",
        shadow: "rgba(245,158,11,0.16)"
      };
    }

    if (kind === "code") {
      return {
        fill: active ? "rgba(196,181,253,0.34)" : "rgba(237,233,254,0.9)",
        stroke: "rgba(124,58,237,0.62)",
        label: "#5b21b6",
        edge: "rgba(139,92,246,0.22)",
        shadow: "rgba(139,92,246,0.16)"
      };
    }

    if (kind === "concept") {
      return {
        fill: active ? "rgba(186,230,253,0.42)" : "rgba(224,242,254,0.94)",
        stroke: "rgba(2,132,199,0.58)",
        label: "#0c4a6e",
        edge: "rgba(14,165,233,0.22)",
        shadow: "rgba(14,165,233,0.14)"
      };
    }

    return {
      fill: active ? "rgba(226,232,240,0.86)" : "rgba(248,250,252,0.96)",
      stroke: "rgba(148,163,184,0.58)",
      label: "#334155",
      edge: "rgba(148,163,184,0.18)",
      shadow: "rgba(148,163,184,0.12)"
    };
  }

  if (kind === "core") {
    return {
      fill: active ? "rgba(180, 83, 9, 0.92)" : "rgba(120, 53, 15, 0.9)",
      stroke: "rgba(251,191,36,0.84)",
      label: "#fde68a",
      edge: "rgba(251,191,36,0.28)",
      shadow: "rgba(249,115,22,0.24)"
    };
  }

  if (kind === "code") {
    return {
      fill: active ? "rgba(88, 28, 135, 0.92)" : "rgba(76, 29, 149, 0.9)",
      stroke: "rgba(196,181,253,0.86)",
      label: "#ede9fe",
      edge: "rgba(167,139,250,0.26)",
      shadow: "rgba(147,51,234,0.22)"
    };
  }

  if (kind === "concept") {
    return {
      fill: active ? "rgba(12, 74, 110, 0.94)" : "rgba(8, 47, 73, 0.9)",
      stroke: "rgba(125,211,252,0.86)",
      label: "#dff6ff",
      edge: "rgba(56,189,248,0.24)",
      shadow: "rgba(14,165,233,0.18)"
    };
  }

  return {
    fill: active ? "rgba(15, 23, 42, 0.94)" : "rgba(2, 6, 23, 0.92)",
    stroke: "rgba(148,163,184,0.72)",
    label: "#dbeafe",
    edge: "rgba(148,163,184,0.2)",
    shadow: "rgba(51,65,85,0.18)"
  };
}

function resolveKeywordCategory(kind: KeywordVisualKind) {
  switch (kind) {
    case "core":
      return 1;
    case "code":
      return 2;
    case "concept":
      return 3;
    default:
      return 4;
  }
}

function summarizeText(content: string, limit: number) {
  const normalized = sanitizeConversationText(content);

  if (!normalized) {
    return "无内容";
  }

  const tokenMatcher = /[\u4e00-\u9fff]|[A-Za-z0-9_]+(?:[-'][A-Za-z0-9_]+)*/g;
  const matches = [...normalized.matchAll(tokenMatcher)];

  if (matches.length <= limit) {
    return normalized;
  }

  const endIndex = (matches[limit - 1].index ?? 0) + matches[limit - 1][0].length;

  return `${normalized.slice(0, endIndex).trim()}...`;
}

function buildPreviewState(node: LogicNodeDatum): LogicPreviewState {
  if (node.kind === "root") {
    return {
      title: "会话中心",
      detail: node.name
    };
  }

  if (node.kind === "keyword") {
    return {
      title: `关键词 · ${node.value} 次`,
      detail: node.name
    };
  }

  return {
    title: `消息锚点 · 关联强度 ${node.matchCount ?? node.value}`,
    detail: node.summary ?? node.name
  };
}
