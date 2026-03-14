import type { KeywordDatum } from "../../shared/types";

interface WordCloudProps {
  keywords: KeywordDatum[];
  activeKeywords: string[];
  prefersDark: boolean;
  onToggleKeyword: (keyword: string) => void;
  onClearKeyword: () => void;
}

export function WordCloud({
  keywords,
  activeKeywords,
  prefersDark,
  onToggleKeyword,
  onClearKeyword
}: WordCloudProps) {
  const hasActiveKeywords = activeKeywords.length > 0;

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
          关键词
        </p>
        {hasActiveKeywords ? (
          <button
            type="button"
            onClick={onClearKeyword}
            className={[
              "rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em] transition",
              prefersDark
                ? "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-100"
                : "border-slate-300 text-slate-600 hover:border-slate-400 hover:bg-white hover:text-slate-900"
            ].join(" ")}
          >
            清空
          </button>
        ) : null}
      </div>

      <div
        className={[
          "mt-3 rounded-3xl border p-3",
          prefersDark
            ? "border-slate-800 bg-slate-950/70"
            : "border-slate-200 bg-slate-50/90"
        ].join(" ")}
      >
        {hasActiveKeywords ? (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {activeKeywords.map((keyword) => (
              <button
                key={keyword}
                type="button"
                onClick={() => onToggleKeyword(keyword)}
                className="rounded-full border border-ticker-cyan/40 bg-ticker-cyan/10 px-2 py-1 text-[10px] font-medium text-ticker-cyan transition hover:border-ticker-cyan hover:bg-ticker-cyan/15"
                title={`从筛选中移除 ${keyword}`}
              >
                {keyword}
              </button>
            ))}
          </div>
        ) : null}

        {keywords.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {keywords.map((keyword, index) => {
              const isActive = activeKeywords.includes(keyword.term);
              const fontSize = 11 + Math.min(12, keyword.count * 1.4);
              const opacity = Math.max(0.48, 1 - index * 0.03);

              return (
                <button
                  key={keyword.term}
                  type="button"
                  onClick={() => onToggleKeyword(keyword.term)}
                  className={[
                    "rounded-full border px-2.5 py-1 transition",
                    isActive
                      ? "border-ticker-cyan/70 bg-ticker-cyan/15 text-ticker-cyan"
                      : prefersDark
                        ? "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-600 hover:text-slate-100"
                        : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-900"
                  ].join(" ")}
                  style={{
                    fontSize,
                    opacity
                  }}
                  title={
                    isActive
                      ? `从筛选中移除 ${keyword.term}`
                      : `加入筛选 ${keyword.term}`
                  }
                >
                  {keyword.term}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm leading-6 text-slate-500">
            还没有足够的回复文本来提取术语。
          </p>
        )}

        {hasActiveKeywords ? (
          <p
            className={[
              "mt-3 text-xs leading-5",
              prefersDark ? "text-slate-400" : "text-slate-600"
            ].join(" ")}
          >
            当前过滤词：
            <span className="text-ticker-cyan">
              {" "}
              {activeKeywords.join(" + ")}
            </span>
            。导航图只会强调同时包含这些词的节点。
          </p>
        ) : (
          <p className="mt-3 text-xs leading-5 text-slate-500">
            点击一个或多个标签后，导航图会强调同时包含这些关键词的对话节点；真正的 3D 知识全景在上方的双模态导航面板里。
          </p>
        )}
      </div>
    </section>
  );
}
