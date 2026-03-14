import { useState } from "react";
import {
  formatTagLabel,
  getTagMatchScore,
  parseTagInput,
  tagsToInput
} from "../../shared/tags";
import { getFeedbackClassName, type FeedbackTone } from "../theme";
import type {
  PromptActionResult,
  PromptVaultDraft,
  PromptVaultItem
} from "../../shared/types";

interface PromptVaultPanelProps {
  prompts: PromptVaultItem[];
  sessionTags: string[];
  prefersDark: boolean;
  onSavePrompt: (draft: PromptVaultDraft) => Promise<void>;
  onDeletePrompt: (id: string) => Promise<void>;
  onUsePrompt: (text: string, autoSend?: boolean) => Promise<PromptActionResult>;
  onCopyPrompt: (text: string) => Promise<PromptActionResult>;
}

interface FeedbackState {
  text: string;
  tone: FeedbackTone;
}

export function PromptVaultPanel({
  prompts,
  sessionTags,
  prefersDark,
  onSavePrompt,
  onDeletePrompt,
  onUsePrompt,
  onCopyPrompt
}: PromptVaultPanelProps) {
  const [draftId, setDraftId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [autoSend, setAutoSend] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  const isEditing = draftId !== null;

  const handleSave = async () => {
    const nextTitle = title.trim();
    const nextContent = content.trim();

    if (!nextTitle || !nextContent) {
      setFeedback({
        text: "标题和内容都不能为空。",
        tone: "error"
      });
      return;
    }

    await onSavePrompt({
      id: draftId ?? undefined,
      title: nextTitle,
      content: nextContent,
      tags: parseTagInput(tagsText)
    });

    setDraftId(null);
    setTitle("");
    setContent("");
    setTagsText("");
    setFeedback({
      text: isEditing ? "指令已更新。" : "指令已保存到指令库。",
      tone: "success"
    });
  };

  const handleDelete = async (id: string) => {
    await onDeletePrompt(id);

    if (draftId === id) {
      setDraftId(null);
      setTitle("");
      setContent("");
      setTagsText("");
    }

    setFeedback({
      text: "指令已删除。",
      tone: "info"
    });
  };

  const handleCopy = async (text: string) => {
    const result = await onCopyPrompt(text);
    setFeedback(getFeedbackFromAction(result));
  };

  const handleInject = async (text: string, shouldAutoSend: boolean) => {
    const result = await onUsePrompt(text, shouldAutoSend);
    setFeedback(getFeedbackFromAction(result));
  };

  const handleEdit = (prompt: PromptVaultItem) => {
    setDraftId(prompt.id);
    setTitle(prompt.title);
    setContent(prompt.content);
    setTagsText(tagsToInput(prompt.tags));
    setFeedback({
      text: `正在编辑「${prompt.title}」。`,
      tone: "info"
    });
  };

  const resetDraft = () => {
    setDraftId(null);
    setTitle("");
    setContent("");
    setTagsText("");
    setFeedback(null);
  };

  return (
    <section>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
          快捷指令
        </p>
        <label
          className={[
            "flex items-center gap-2 text-[11px]",
            prefersDark ? "text-slate-400" : "text-slate-600"
          ].join(" ")}
        >
          <input
            type="checkbox"
            checked={autoSend}
            onChange={(event) => setAutoSend(event.target.checked)}
            className={[
              "h-3.5 w-3.5 rounded text-ticker-cyan focus:ring-ticker-cyan",
              prefersDark
                ? "border-slate-700 bg-slate-900"
                : "border-slate-300 bg-white"
            ].join(" ")}
          />
          自动发送
        </label>
      </div>

      <div
        className={[
          "mt-3 rounded-3xl border p-3",
          prefersDark
            ? "border-slate-800 bg-slate-950/70"
            : "border-slate-200 bg-slate-50/90"
        ].join(" ")}
      >
        <div className="space-y-2">
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="指令标题"
            className={[
              "w-full rounded-2xl border px-3 py-2 text-sm outline-none transition placeholder:text-slate-500 focus:border-ticker-cyan/60",
              prefersDark
                ? "border-slate-800 bg-slate-900 text-slate-100"
                : "border-slate-300 bg-white text-slate-900"
            ].join(" ")}
          />
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="输入常用指令，支持多行。"
            rows={4}
            className={[
              "w-full resize-none rounded-2xl border px-3 py-2 text-sm outline-none transition placeholder:text-slate-500 focus:border-ticker-cyan/60",
              prefersDark
                ? "border-slate-800 bg-slate-900 text-slate-100"
                : "border-slate-300 bg-white text-slate-900"
            ].join(" ")}
          />
          <input
            type="text"
            value={tagsText}
            onChange={(event) => setTagsText(event.target.value)}
            placeholder="#Radar, #DeepLearning"
            className={[
              "w-full rounded-2xl border px-3 py-2 text-sm outline-none transition placeholder:text-slate-500 focus:border-ticker-cyan/60",
              prefersDark
                ? "border-slate-800 bg-slate-900 text-slate-100"
                : "border-slate-300 bg-white text-slate-900"
            ].join(" ")}
          />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleSave()}
            className={[
              "rounded-full border px-3 py-1.5 text-xs transition",
              prefersDark
                ? "border-slate-700 text-slate-300 hover:border-slate-500 hover:text-slate-100"
                : "border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-white hover:text-slate-900"
            ].join(" ")}
          >
            {isEditing ? "更新" : "保存"}
          </button>
          <button
            type="button"
            onClick={resetDraft}
            className={[
              "rounded-full border px-3 py-1.5 text-xs transition",
              prefersDark
                ? "border-slate-700 text-slate-300 hover:border-slate-500 hover:text-slate-100"
                : "border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-white hover:text-slate-900"
            ].join(" ")}
          >
            清空
          </button>
        </div>

        {feedback ? (
          <div
            className={[
              "mt-3 rounded-2xl border px-3 py-2 text-xs",
              getFeedbackClassName(feedback.tone, prefersDark)
            ].join(" ")}
          >
            {feedback.text}
          </div>
        ) : null}
      </div>

      <div className="mt-3 space-y-3">
        {prompts.length > 0 ? (
          prompts.map((prompt) => {
            const matchScore = getTagMatchScore(prompt.tags, sessionTags);

            return (
              <article
                key={prompt.id}
                className={[
                  "rounded-3xl border p-3",
                  prefersDark
                    ? "border-slate-800 bg-slate-900/90"
                    : "border-slate-200 bg-white"
                ].join(" ")}
              >
                <button
                  type="button"
                  onClick={() => void handleInject(prompt.content, autoSend)}
                  className="w-full text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div
                          className={[
                            "text-sm font-medium",
                            prefersDark ? "text-slate-100" : "text-slate-900"
                          ].join(" ")}
                        >
                          {prompt.title}
                        </div>
                        {matchScore > 0 ? (
                          <span className="rounded-full border border-ticker-cyan/30 bg-ticker-cyan/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-ticker-cyan">
                            推荐
                          </span>
                        ) : null}
                      </div>
                      <div
                        className={[
                          "mt-1 max-h-16 overflow-hidden text-xs leading-5",
                          prefersDark ? "text-slate-400" : "text-slate-600"
                        ].join(" ")}
                      >
                        {prompt.content}
                      </div>
                      {prompt.tags.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {prompt.tags.map((tag) => (
                            <span
                              key={`${prompt.id}-${tag}`}
                              className={[
                                "rounded-full border px-2 py-0.5 text-[10px]",
                                sessionTags.some((sessionTag) => sessionTag.toLowerCase() === tag.toLowerCase())
                                  ? "border-ticker-cyan/30 bg-ticker-cyan/10 text-ticker-cyan"
                                  : prefersDark
                                    ? "border-slate-700 text-slate-400"
                                    : "border-slate-300 text-slate-600"
                              ].join(" ")}
                            >
                              {formatTagLabel(tag)}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <span
                      className={[
                        "rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em]",
                        prefersDark
                          ? "border-slate-700 text-slate-400"
                          : "border-slate-300 text-slate-600"
                      ].join(" ")}
                    >
                      {autoSend ? "发送" : "填入"}
                    </span>
                  </div>
                </button>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleInject(prompt.content, false)}
                    className={[
                      "rounded-full border px-2.5 py-1 text-xs transition hover:border-ticker-cyan/60 hover:text-ticker-cyan",
                      prefersDark
                        ? "border-slate-700 text-slate-300"
                        : "border-slate-300 text-slate-700"
                    ].join(" ")}
                  >
                    填入
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleInject(prompt.content, true)}
                    className={[
                      "rounded-full border px-2.5 py-1 text-xs transition",
                      prefersDark
                        ? "border-emerald-500/30 text-emerald-200 hover:border-emerald-400 hover:text-emerald-100"
                        : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:border-emerald-400 hover:bg-emerald-100"
                    ].join(" ")}
                  >
                    发送
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopy(prompt.content)}
                    className={[
                      "rounded-full border px-2.5 py-1 text-xs transition",
                      prefersDark
                        ? "border-slate-700 text-slate-300 hover:border-slate-500 hover:text-slate-100"
                        : "border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900"
                    ].join(" ")}
                  >
                    复制
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEdit(prompt)}
                    className={[
                      "rounded-full border px-2.5 py-1 text-xs transition",
                      prefersDark
                        ? "border-slate-700 text-slate-300 hover:border-slate-500 hover:text-slate-100"
                        : "border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900"
                    ].join(" ")}
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(prompt.id)}
                    className={[
                      "rounded-full border px-2.5 py-1 text-xs transition",
                      prefersDark
                        ? "border-rose-500/30 text-rose-200 hover:border-rose-400 hover:text-rose-100"
                        : "border-rose-300 bg-rose-50 text-rose-700 hover:border-rose-400 hover:bg-rose-100"
                    ].join(" ")}
                  >
                    删除
                  </button>
                </div>
              </article>
            );
          })
        ) : (
          <p
            className={[
              "rounded-3xl border border-dashed px-4 py-6 text-sm leading-6 text-slate-500",
              prefersDark
                ? "border-slate-800 bg-slate-950/70"
                : "border-slate-300 bg-slate-50/90"
            ].join(" ")}
          >
            还没有保存的快捷指令。先在上面创建一条，之后就可以一键填入、复制或直接发送。
          </p>
        )}
      </div>
    </section>
  );
}

function getFeedbackFromAction(result: PromptActionResult): FeedbackState {
  if (result.ok) {
    switch (result.action) {
      case "copied":
        return {
          text: "指令已复制到剪贴板。",
          tone: "success"
        };
      case "sent":
        return {
          text: "指令已填入并发送。",
          tone: "success"
        };
      case "filled":
      default:
        return {
          text: "指令已填入输入框。",
          tone: "success"
        };
    }
  }

  switch (result.reason) {
    case "prompt-input-not-found":
      return {
        text: "没有找到 ChatGPT 输入框，当前 DOM 选择器可能需要再校准。",
        tone: "error"
      };
    case "send-button-not-found":
      return {
        text: "内容已填入，但没有定位到发送按钮。",
        tone: "info"
      };
    case "send-button-disabled":
      return {
        text: "内容已填入，但发送按钮没有被激活。",
        tone: "info"
      };
    case "clipboard-unavailable":
    default:
      return {
        text: "复制失败，浏览器没有提供可用的剪贴板接口。",
        tone: "error"
      };
  }
}
