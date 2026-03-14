import { formatTagLabel } from "../../shared/tags";

interface SessionTagStripProps {
  tags: string[];
  prefersDark: boolean;
}

export function SessionTagStrip({ tags, prefersDark }: SessionTagStripProps) {
  if (tags.length === 0) {
    return (
      <div
        className={[
          "border-b px-1 py-2 text-center text-[9px] uppercase tracking-[0.16em] text-slate-500",
          prefersDark ? "border-slate-800" : "border-slate-200"
        ].join(" ")}
      >
        无标签
      </div>
    );
  }

  return (
    <div
      className={[
        "border-b px-1 py-2",
        prefersDark ? "border-slate-800" : "border-slate-200"
      ].join(" ")}
    >
      <div className="flex flex-col items-center gap-1">
        {tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className={[
              "max-w-full truncate rounded-full border px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-[0.12em]",
              prefersDark
                ? "border-slate-700 bg-slate-900 text-slate-300"
                : "border-slate-300 bg-white text-slate-700"
            ].join(" ")}
            title={formatTagLabel(tag)}
          >
            {formatTagLabel(tag)}
          </span>
        ))}
        {tags.length > 3 ? (
          <span className="text-[8px] text-slate-500">+{tags.length - 3}</span>
        ) : null}
      </div>
    </div>
  );
}
