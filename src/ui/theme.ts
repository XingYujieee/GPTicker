export type FeedbackTone = "error" | "info" | "success";

export function pickTheme<T>(prefersDark: boolean, darkValue: T, lightValue: T) {
  return prefersDark ? darkValue : lightValue;
}

export function getFeedbackClassName(
  tone: FeedbackTone,
  prefersDark: boolean
) {
  if (tone === "error") {
    return prefersDark
      ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
      : "border-rose-300 bg-rose-50 text-rose-700";
  }

  if (tone === "success") {
    return prefersDark
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : "border-emerald-300 bg-emerald-50 text-emerald-700";
  }

  return prefersDark
    ? "border-slate-700 bg-slate-900 text-slate-300"
    : "border-slate-300 bg-slate-50 text-slate-700";
}

export function getFloatingShellShadow(prefersDark: boolean) {
  return prefersDark
    ? "0 24px 60px rgba(2, 6, 23, 0.48)"
    : "0 20px 48px rgba(148, 163, 184, 0.24)";
}
