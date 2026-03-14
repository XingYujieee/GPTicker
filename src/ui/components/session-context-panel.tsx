import { useEffect, useState } from "react";
import { formatTagLabel, parseTagInput, tagsToInput } from "../../shared/tags";
import { getFeedbackClassName, type FeedbackTone } from "../theme";
import type {
  MarkdownExportResult,
  SessionMetadata
} from "../../shared/types";

interface SessionContextPanelProps {
  session: SessionMetadata;
  prefersDark: boolean;
  onSaveSessionTags: (tags: string[]) => Promise<void>;
  onExportMarkdown: () => Promise<MarkdownExportResult>;
}

interface FeedbackState {
  text: string;
  tone: FeedbackTone;
}

export function SessionContextPanel({
  session,
  prefersDark,
  onSaveSessionTags,
  onExportMarkdown
}: SessionContextPanelProps) {
  const [tagsInput, setTagsInput] = useState(tagsToInput(session.tags));
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  useEffect(() => {
    setTagsInput(tagsToInput(session.tags));
  }, [session.tags]);

  const handleSave = async () => {
    const tags = parseTagInput(tagsInput);

    await onSaveSessionTags(tags);
    setFeedback({
      text: tags.length > 0 ? "会话标签已保存。" : "会话标签已清空。",
      tone: "success"
    });
  };

  const handleExport = async () => {
    const result = await onExportMarkdown();

    setFeedback(getExportFeedback(result));
  };

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
          会话标签
        </p>
        <button
          type="button"
          onClick={() => void handleExport()}
          className={[
            "rounded-full border px-2.5 py-1 text-[10px] font-medium transition",
            prefersDark
              ? "border-slate-700 text-slate-300 hover:border-slate-500 hover:text-slate-100"
              : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900"
          ].join(" ")}
        >
          导出 MD
        </button>
      </div>

      <div
        className={[
          "mt-3 rounded-3xl border p-3",
          prefersDark
            ? "border-slate-800 bg-slate-950/70"
            : "border-slate-200 bg-slate-50/90"
        ].join(" ")}
      >
        <p
          className={[
            "text-sm font-medium",
            prefersDark ? "text-slate-100" : "text-slate-900"
          ].join(" ")}
        >
          {session.title}
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-500">{session.sessionKey}</p>

        <div className="mt-3 flex flex-wrap gap-2">
          {session.tags.length > 0 ? (
            session.tags.map((tag) => (
              <span
                key={tag}
                className={[
                  "rounded-full border px-2 py-1 text-[11px]",
                  prefersDark
                    ? "border-slate-700 bg-slate-900 text-slate-300"
                    : "border-slate-300 bg-white text-slate-700"
                ].join(" ")}
              >
                {formatTagLabel(tag)}
              </span>
            ))
          ) : (
            <span className="text-xs text-slate-500">
              当前会话还没有标签。
            </span>
          )}
        </div>

        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={tagsInput}
            onChange={(event) => setTagsInput(event.target.value)}
            placeholder="#Radar, #DeepLearning"
            className={[
              "min-w-0 flex-1 rounded-2xl border px-3 py-2 text-sm outline-none transition placeholder:text-slate-500 focus:border-ticker-cyan/60",
              prefersDark
                ? "border-slate-800 bg-slate-900 text-slate-100"
                : "border-slate-300 bg-white text-slate-900"
            ].join(" ")}
          />
          <button
            type="button"
            onClick={() => void handleSave()}
            className={[
              "rounded-2xl px-3 py-2 text-xs font-semibold transition",
              prefersDark
                ? "bg-slate-100 text-slate-950 hover:bg-white"
                : "border border-slate-300 bg-white text-slate-900 hover:border-slate-400 hover:bg-slate-50"
            ].join(" ")}
          >
            保存
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
    </section>
  );
}

function getExportFeedback(result: MarkdownExportResult): FeedbackState {
  if (result.ok) {
    return {
      text: `Markdown 已导出为 ${result.filename ?? "conversation.md"}。`,
      tone: "success"
    };
  }

  return {
    text: result.reason ?? "导出失败。",
    tone: "error"
  };
}
