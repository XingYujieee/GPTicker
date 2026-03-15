import { Suspense, lazy, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type {
  ConversationNode,
  FloatingPanelPosition,
  GPTickerUIState,
  HoverPreviewPayload,
  KeywordDatum,
  KnowledgeViewMode,
  MarkdownExportResult,
  MinimapMode,
  PromptActionResult,
  PromptVaultDraft,
  PromptVaultItem,
  SessionMetadata,
  SelectorHealthState
} from "../../shared/types";
import { sanitizeConversationText } from "../../shared/utils";
import { getFloatingShellShadow, pickTheme } from "../theme";
import { MinimapDots } from "./minimap-dots";
import { PromptVaultPanel } from "./prompt-vault-panel";
import { SessionContextPanel } from "./session-context-panel";
import { SessionTagStrip } from "./session-tag-strip";
import { WordCloud } from "./word-cloud";

const PointCloud3D = lazy(async () => {
  const module = await import("./point-cloud-3d");
  return {
    default: module.PointCloud3D
  };
});

const LogicGraph2D = lazy(async () => {
  const module = await import("./logic-graph-2d");
  return {
    default: module.LogicGraph2D
  };
});

interface SidebarShellProps {
  conversationNodes: ConversationNode[];
  nodes: ConversationNode[];
  activeId: string | null;
  activeKeywords: string[];
  minimapMode: MinimapMode;
  drawerOpen: boolean;
  ui: GPTickerUIState;
  prompts: PromptVaultItem[];
  keywords: KeywordDatum[];
  session: SessionMetadata;
  selectorHealth: SelectorHealthState;
  matchingNodeIds: ReadonlySet<string> | null;
  keywordIntensity: ReadonlyMap<string, number>;
  onSelectNode: (id: string) => void;
  onSetMinimapMode: (mode: MinimapMode) => void;
  onToggleDrawer: () => void;
  onSetMinimized: (minimized: boolean) => Promise<void> | void;
  onPersistPanelPosition: (position: FloatingPanelPosition) => Promise<void> | void;
  onToggleKeyword: (keyword: string) => void;
  onClearKeyword: () => void;
  onSaveSessionTags: (tags: string[]) => Promise<void>;
  onExportMarkdown: () => Promise<MarkdownExportResult>;
  onSavePrompt: (draft: PromptVaultDraft) => Promise<void>;
  onDeletePrompt: (id: string) => Promise<void>;
  onUsePrompt: (text: string, autoSend?: boolean) => Promise<PromptActionResult>;
  onCopyPrompt: (text: string) => Promise<PromptActionResult>;
}

export function SidebarShell({
  conversationNodes,
  nodes,
  activeId,
  activeKeywords,
  minimapMode,
  drawerOpen,
  ui,
  prompts,
  keywords,
  session,
  selectorHealth,
  matchingNodeIds,
  keywordIntensity,
  onSelectNode,
  onSetMinimapMode,
  onToggleDrawer,
  onSetMinimized,
  onPersistPanelPosition,
  onToggleKeyword,
  onClearKeyword,
  onSaveSessionTags,
  onExportMarkdown,
  onSavePrompt,
  onDeletePrompt,
  onUsePrompt,
  onCopyPrompt
}: SidebarShellProps) {
  const [hoverPreview, setHoverPreview] = useState<HoverPreviewPayload | null>(null);
  const [knowledgeViewMode, setKnowledgeViewMode] = useState<KnowledgeViewMode>("2d");
  const [panelPosition, setPanelPosition] = useState<FloatingPanelPosition>(() =>
    clampPanelPosition(ui.position, ui.minimized)
  );
  const getChatGptThemeMode = () => {
    if (typeof document === "undefined") {
      return null;
    }

    const doc = document.documentElement;

    // ChatGPT currently uses data attributes to store theme preference.
    // Examples:
    // - <html data-color-mode="dark"> (common)
    // - <html data-theme="dark"> (possible fallback)
    // - class="dark" (common tailwind-style)
    const colorMode = doc.getAttribute("data-color-mode");
    if (colorMode === "dark" || colorMode === "light") {
      return colorMode;
    }

    const dataTheme = doc.getAttribute("data-theme");
    if (dataTheme === "dark" || dataTheme === "light") {
      return dataTheme;
    }

    if (doc.classList.contains("dark")) {
      return "dark";
    }

    if (doc.classList.contains("light")) {
      return "light";
    }

    return null;
  };

  const prefersDarkFromChatGpt = () => {
    const theme = getChatGptThemeMode();
    if (theme === "dark") {
      return true;
    }
    if (theme === "light") {
      return false;
    }

    // Fallback to system preference
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  };

  const [prefersDark, setPrefersDark] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }

    return prefersDarkFromChatGpt();
  });
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    startPosition: FloatingPanelPosition;
    moved: boolean;
  } | null>(null);
  const panelPositionRef = useRef(panelPosition);
  const suppressRestoreClickRef = useRef(false);
  const shellHeightPx = getShellHeightPx();
  const shellHeight = `${shellHeightPx}px`;
  const drawerPlacement = resolveDrawerPlacement(panelPosition.left);

  useEffect(() => {
    // Sync with ChatGPT 的「常规 - 外观」设置
    const updateFromChatGpt = () => {
      setPrefersDark(prefersDarkFromChatGpt());
    };

    updateFromChatGpt();

    // 监听 HTML 属性变化（ChatGPT 切换深色/浅色时会更新 data-color-mode）
    const observer = new MutationObserver(updateFromChatGpt);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-color-mode", "data-theme"],
      attributeOldValue: false
    });

    // 兼容系统主题切换
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersDark(event.matches);
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  useEffect(() => {
    const mount = document.getElementById("gpticker-app");

    if (!mount) {
      return;
    }

    mount.dataset.theme = prefersDark ? "dark" : "light";
  }, [prefersDark]);

  useEffect(() => {
    setHoverPreview(null);
  }, [drawerOpen, knowledgeViewMode, ui.minimized]);

  useEffect(() => {
    if (dragStateRef.current) {
      return;
    }

    setPanelPosition(clampPanelPosition(ui.position, ui.minimized));
  }, [ui.minimized, ui.position.left, ui.position.top]);

  useEffect(() => {
    panelPositionRef.current = panelPosition;
  }, [panelPosition]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;

      if (!dragState) {
        return;
      }

      const nextPosition = clampPanelPosition(
        {
          top: dragState.startPosition.top + (event.clientY - dragState.startY),
          left: dragState.startPosition.left + (event.clientX - dragState.startX)
        },
        ui.minimized
      );

      if (
        Math.abs(event.clientX - dragState.startX) > 3 ||
        Math.abs(event.clientY - dragState.startY) > 3
      ) {
        dragState.moved = true;
      }

      setPanelPosition(nextPosition);
    };
    const finishDrag = () => {
      const dragState = dragStateRef.current;

      if (!dragState) {
        return;
      }

      dragStateRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";

      if (dragState.moved) {
        suppressRestoreClickRef.current = true;
      }

      void onPersistPanelPosition(panelPositionRef.current);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    };
  }, [onPersistPanelPosition, ui.minimized]);

  useEffect(() => {
    const handleResize = () => {
      setPanelPosition((current) => {
        const next = clampPanelPosition(current, ui.minimized);

        if (next.left !== current.left || next.top !== current.top) {
          void onPersistPanelPosition(next);
        }

        return next;
      });
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [onPersistPanelPosition, ui.minimized]);

  const startDragging = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }

    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startPosition: panelPositionRef.current,
      moved: false
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
  };

  const handleRestore = () => {
    if (suppressRestoreClickRef.current) {
      suppressRestoreClickRef.current = false;
      return;
    }

    void onSetMinimized(false);
  };

  return (
    <div
      data-theme={prefersDark ? "dark" : "light"}
      className="pointer-events-none fixed z-[2147483647]"
      style={{
        top: panelPosition.top,
        left: panelPosition.left
      }}
    >
      {drawerOpen && !ui.minimized ? (
        <section
          className={[
            "pointer-events-auto absolute top-0 flex w-[26rem] flex-col overflow-hidden rounded-3xl border shadow-shell backdrop-blur-xl transition-transform duration-200 ease-out",
            prefersDark
              ? "border-slate-800/80 bg-slate-950/96 text-slate-100"
              : "border-slate-200/90 bg-white/95 text-slate-900",
            drawerPlacement === "left"
              ? "right-[calc(100%+0.5rem)]"
              : "left-[calc(100%+0.5rem)]"
          ].join(" ")}
          style={{
            height: shellHeight,
            boxShadow: getFloatingShellShadow(prefersDark),
            background: prefersDark
              ? "linear-gradient(180deg, rgba(2,6,23,0.96), rgba(2,6,23,0.92))"
              : "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.98))"
          }}
        >
          <div
            className={[
              "cursor-grab select-none border-b px-4 py-4 active:cursor-grabbing",
              prefersDark ? "border-slate-800" : "border-slate-200"
            ].join(" ")}
            onPointerDown={startDragging}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className={prefersDark ? "text-slate-600" : "text-slate-400"}>::</span>
                <p
                  className={[
                    "text-[10px] font-semibold uppercase tracking-[0.24em]",
                    prefersDark ? "text-slate-400" : "text-slate-500"
                  ].join(" ")}
                >
                  GPTicker 面板
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className={[
                    "h-2.5 w-2.5 rounded-full",
                    selectorHealth.degraded ? "bg-ticker-rose shadow-[0_0_0_4px_rgba(251,113,133,0.16)]" : "bg-emerald-400/80"
                  ].join(" ")}
                  title={getHealthLabel(selectorHealth)}
                />
                <button
                  type="button"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                  }}
                  onClick={() => void onSetMinimized(true)}
                  className={[
                    "rounded-full border px-2 py-0.5 text-[10px] transition",
                    prefersDark
                      ? "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-100"
                      : "border-slate-300 text-slate-600 hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900"
                  ].join(" ")}
                >
                  缩
                </button>
              </div>
            </div>
            <h2
              className={[
                "mt-2 text-base font-semibold tracking-[0.01em]",
                prefersDark ? "text-slate-200" : "text-slate-800"
              ].join(" ")}
            >
              GPTicker
            </h2>
            <p
              className={[
                "mt-1 text-xs leading-5",
                prefersDark ? "text-slate-400" : "text-slate-600"
              ].join(" ")}
            >
              快捷指令会根据当前会话标签优先排序，并支持一键导出 Markdown。
            </p>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
            <section
              className={[
                "rounded-3xl border p-3",
                prefersDark
                  ? "border-slate-800 bg-slate-950/70"
                  : "border-slate-200 bg-slate-50/90"
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                    双模态导航
                  </p>
                  <p
                    className={[
                      "mt-1 text-xs leading-5",
                      prefersDark ? "text-slate-400" : "text-slate-600"
                    ].join(" ")}
                  >
                    2D 拓扑指引逻辑方向，3D 映射折射知识全景。
                  </p>
                </div>
                <div
                  className={[
                    "rounded-full border p-1 backdrop-blur-xl",
                    prefersDark
                      ? "border-white/10 bg-white/5"
                      : "border-slate-300 bg-white/80"
                  ].join(" ")}
                >
                  <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => setKnowledgeViewMode("2d")}
                    className={[
                      "rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.16em] transition",
                      knowledgeViewMode === "2d"
                        ? pickTheme(
                            prefersDark,
                            "bg-white/10 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(103,232,249,0.24),0_8px_24px_rgba(8,145,178,0.12)]",
                            "bg-cyan-50 text-cyan-700 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.18),0_8px_24px_rgba(14,165,233,0.08)]"
                          )
                        : pickTheme(
                            prefersDark,
                            "text-slate-400 hover:text-slate-100",
                            "text-slate-600 hover:text-slate-900"
                          )
                    ].join(" ")}
                  >
                    2D 拓扑
                  </button>
                  <button
                    type="button"
                    onClick={() => setKnowledgeViewMode("3d")}
                    className={[
                      "rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.16em] transition",
                      knowledgeViewMode === "3d"
                        ? pickTheme(
                            prefersDark,
                            "bg-white/10 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(103,232,249,0.24),0_8px_24px_rgba(8,145,178,0.12)]",
                            "bg-cyan-50 text-cyan-700 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.18),0_8px_24px_rgba(14,165,233,0.08)]"
                          )
                        : pickTheme(
                            prefersDark,
                            "text-slate-400 hover:text-slate-100",
                            "text-slate-600 hover:text-slate-900"
                          )
                    ].join(" ")}
                  >
                    3D 全景
                  </button>
                </div>
                </div>
              </div>

              <div className="mt-3 h-72">
                {knowledgeViewMode === "3d" ? (
                  <Suspense
                    fallback={
                      <div
                        className={[
                          "h-full w-full rounded-[28px]",
                          prefersDark ? "bg-slate-900/80" : "bg-slate-100"
                        ].join(" ")}
                      />
                    }
                  >
                    <PointCloud3D
                      nodes={conversationNodes}
                      keywords={keywords}
                      activeKeywords={activeKeywords}
                      prefersDark={prefersDark}
                      onPreviewChange={setHoverPreview}
                      onToggleKeyword={onToggleKeyword}
                    />
                  </Suspense>
                ) : (
                  <Suspense
                    fallback={
                      <div
                        className={[
                          "h-full w-full rounded-[28px]",
                          prefersDark ? "bg-slate-900/80" : "bg-slate-100"
                        ].join(" ")}
                      />
                    }
                  >
                    <LogicGraph2D
                      sessionTitle={session.title}
                      nodes={conversationNodes}
                      keywords={keywords}
                      activeKeywords={activeKeywords}
                      prefersDark={prefersDark}
                      onPreviewChange={setHoverPreview}
                      onSelectNode={onSelectNode}
                      onToggleKeyword={onToggleKeyword}
                    />
                  </Suspense>
                )}
              </div>

              <p className="mt-3 text-xs leading-5 text-slate-500">
                {knowledgeViewMode === "3d"
                  ? "3D 全景会用关键词簇、星座连线和景深标签来映射折射当前对话的知识全景。"
                  : "2D 拓扑会用会话标题、关键词和消息节点来指引当前对话的逻辑方向。"}
              </p>
            </section>

            <SessionContextPanel
              session={session}
              prefersDark={prefersDark}
              onSaveSessionTags={onSaveSessionTags}
              onExportMarkdown={onExportMarkdown}
            />

            <WordCloud
              keywords={keywords}
              activeKeywords={activeKeywords}
              prefersDark={prefersDark}
              onToggleKeyword={onToggleKeyword}
              onClearKeyword={onClearKeyword}
            />

            <PromptVaultPanel
              prompts={prompts}
              sessionTags={session.tags}
              prefersDark={prefersDark}
              onSavePrompt={onSavePrompt}
              onDeletePrompt={onDeletePrompt}
              onUsePrompt={onUsePrompt}
              onCopyPrompt={onCopyPrompt}
            />
          </div>
        </section>
      ) : null}

      {ui.minimized ? (
        <button
          type="button"
          onPointerDown={startDragging}
          onClick={handleRestore}
          className={[
            "pointer-events-auto flex h-14 w-14 flex-col items-center justify-center rounded-2xl border shadow-shell backdrop-blur-xl transition-transform duration-200 ease-out hover:scale-[1.03]",
            prefersDark
              ? "border-slate-800/90 bg-slate-950/94 text-slate-100"
              : "border-slate-200 bg-white/95 text-slate-900"
          ].join(" ")}
          style={{
            boxShadow: getFloatingShellShadow(prefersDark),
            background: prefersDark
              ? "linear-gradient(180deg, rgba(2,6,23,0.94), rgba(15,23,42,0.94))"
              : "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(241,245,249,0.98))"
          }}
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ticker-cyan">
            GPT
          </span>
          <span
            className={[
              "mt-1 text-[9px]",
              prefersDark ? "text-slate-400" : "text-slate-600"
            ].join(" ")}
          >
            展开
          </span>
        </button>
      ) : (
        <aside
          className={[
            "pointer-events-auto flex w-[60px] flex-col overflow-hidden rounded-3xl border shadow-shell backdrop-blur-xl transition-transform duration-200 ease-out",
            prefersDark
              ? "border-slate-800/80 bg-slate-950/90 text-slate-100"
              : "border-slate-200 bg-white/95 text-slate-900"
          ].join(" ")}
          style={{
            height: shellHeight,
            boxShadow: getFloatingShellShadow(prefersDark),
            background: prefersDark
              ? "linear-gradient(180deg, rgba(2,6,23,0.94), rgba(2,6,23,0.9))"
              : "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.98))"
          }}
        >
          <div
            className={[
              "border-b px-2 py-2",
              prefersDark ? "border-slate-800" : "border-slate-200"
            ].join(" ")}
          >
            <div
              className={[
                "mb-2 flex cursor-grab select-none items-center justify-center gap-1 rounded-xl border py-1.5 active:cursor-grabbing",
                prefersDark
                  ? "border-slate-800 bg-slate-900/60"
                  : "border-slate-200 bg-slate-50/80"
              ].join(" ")}
              onPointerDown={startDragging}
            >
              <span className={prefersDark ? "text-slate-600" : "text-slate-400"}>::</span>
              <span className="text-[8px] font-semibold uppercase tracking-[0.24em] text-ticker-cyan">
                导航
              </span>
            </div>
            <div
              className="grid grid-cols-2 gap-1"
            >
              <button
                type="button"
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={() => void onSetMinimized(true)}
                aria-label="最小化 GPTicker"
                className={[
                  "rounded-xl border px-0 py-1 text-[10px] transition",
                  prefersDark
                    ? "border-slate-700 text-slate-300 hover:border-slate-500 hover:text-slate-100"
                    : "border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900"
                ].join(" ")}
              >
                缩
              </button>
              <button
                type="button"
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={onToggleDrawer}
                aria-label={drawerOpen ? "收起 GPTicker 面板" : "展开 GPTicker 面板"}
                className={[
                  "rounded-xl border px-0 py-1 text-[12px] font-semibold text-ticker-cyan transition hover:border-ticker-cyan/60 hover:bg-ticker-cyan/10",
                  prefersDark ? "border-slate-700" : "border-slate-300"
                ].join(" ")}
              >
                {drawerOpen ? "-" : "+"}
              </button>
            </div>
          </div>

          <SessionTagStrip tags={session.tags} prefersDark={prefersDark} />

          <div
            className={[
              "border-b px-1 py-2",
              prefersDark ? "border-slate-800" : "border-slate-200"
            ].join(" ")}
          >
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => onSetMinimapMode("questions")}
                className={[
                  "rounded-full border px-0 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] transition",
                  minimapMode === "questions"
                    ? pickTheme(
                        prefersDark,
                        "border-emerald-400/50 bg-emerald-500/10 text-emerald-200",
                        "border-emerald-500/50 bg-emerald-50 text-emerald-700"
                      )
                    : pickTheme(
                        prefersDark,
                        "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-100",
                        "border-slate-300 text-slate-600 hover:border-slate-400 hover:text-slate-900"
                      )
                ].join(" ")}
                title="只看你的提问"
              >
                Q
              </button>
              <button
                type="button"
                onClick={() => onSetMinimapMode("all")}
                className={[
                  "rounded-full border px-0 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] transition",
                  minimapMode === "all"
                    ? pickTheme(
                        prefersDark,
                        "border-ticker-cyan/50 bg-ticker-cyan/10 text-ticker-cyan",
                        "border-ticker-cyan/50 bg-cyan-50 text-cyan-700"
                      )
                    : pickTheme(
                        prefersDark,
                        "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-100",
                        "border-slate-300 text-slate-600 hover:border-slate-400 hover:text-slate-900"
                      )
                ].join(" ")}
                title="查看全部消息"
              >
                All
              </button>
            </div>
            <p className="mt-1 text-center text-[8px] uppercase tracking-[0.12em] text-slate-500">
              Q=提问
            </p>
          </div>

          <div className="min-h-0 flex-1">
            <MinimapDots
              nodes={nodes}
              activeId={activeId}
              mode={minimapMode}
              prefersDark={prefersDark}
              variant="compact"
              matchingNodeIds={matchingNodeIds}
              keywordIntensity={keywordIntensity}
              onPreviewChange={setHoverPreview}
              onSelect={onSelectNode}
            />
          </div>
        </aside>
      )}

      {hoverPreview && !ui.minimized ? (
        <div
          className={[
            "pointer-events-none fixed z-[2147483647] w-56 -translate-x-full -translate-y-1/2 rounded-2xl border px-3 py-2 text-left shadow-shell",
            prefersDark
              ? "border-slate-800 bg-black text-white"
              : "border-slate-300 bg-white text-slate-950"
          ].join(" ")}
          style={{
            top: hoverPreview.top,
            left: hoverPreview.left
          }}
        >
          {hoverPreview.label ? (
            <p
              className={[
                "mb-1 text-[10px] uppercase tracking-[0.12em]",
                prefersDark ? "text-slate-400" : "text-slate-500"
              ].join(" ")}
            >
              {hoverPreview.label}
            </p>
          ) : null}
          <p className="text-[11px] leading-5">
            {hoverPreview.kind === "keyword"
              ? hoverPreview.text
              : summarizePreviewText(hoverPreview.text, 30)}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function getHealthLabel(selectorHealth: SelectorHealthState) {
  if (selectorHealth.degraded) {
    return `选择器漂移：${selectorHealth.missingTargets.join(", ")}`;
  }

  return selectorHealth.debugEnabled
    ? "选择器稳定 · 调试日志已开启"
    : "选择器稳定";
}

function summarizePreviewText(content: string, limit: number) {
  const normalized = sanitizeConversationText(content);

  if (!normalized) {
    return "无内容";
  }

  const tokenMatcher = /[\u4e00-\u9fff]|[A-Za-z0-9_]+(?:[-'][A-Za-z0-9_]+)*/g;
  const matches = [...normalized.matchAll(tokenMatcher)];

  if (matches.length === 0) {
    const fallback = Array.from(normalized);

    return fallback.length > limit
      ? `${fallback.slice(0, limit).join("")}...`
      : normalized;
  }

  if (matches.length <= limit) {
    return normalized;
  }

  const endIndex = (matches[limit - 1].index ?? 0) + matches[limit - 1][0].length;
  return `${normalized.slice(0, endIndex).trim()}...`;
}

const ASIDE_WIDTH = 60;
const DRAWER_WIDTH = 416;
const MINIMIZED_SIZE = 56;
const MAX_SHELL_HEIGHT = 704;

function getShellHeightPx() {
  if (typeof window === "undefined") {
    return MAX_SHELL_HEIGHT;
  }

  return Math.min(window.innerHeight - 16, MAX_SHELL_HEIGHT);
}

function clampPanelPosition(
  position: FloatingPanelPosition,
  minimized: boolean
): FloatingPanelPosition {
  if (typeof window === "undefined") {
    return position;
  }

  const visibleWidth = minimized ? MINIMIZED_SIZE : ASIDE_WIDTH;
  const visibleHeight = minimized ? MINIMIZED_SIZE : getShellHeightPx();

  return {
    top: clamp(position.top, 8, Math.max(8, window.innerHeight - visibleHeight - 8)),
    left: clamp(position.left, 8, Math.max(8, window.innerWidth - visibleWidth - 8))
  };
}

function resolveDrawerPlacement(panelLeft: number) {
  if (typeof window === "undefined") {
    return "left" as const;
  }

  const spaceLeft = panelLeft - 8;
  const spaceRight = window.innerWidth - panelLeft - ASIDE_WIDTH - 8;

  if (spaceLeft >= DRAWER_WIDTH || spaceLeft >= spaceRight) {
    return "left" as const;
  }

  return "right" as const;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
