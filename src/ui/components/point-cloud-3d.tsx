import { Suspense, lazy } from "react";
import type { PointCloud3DProps } from "./point-cloud-3d-runtime";

const PointCloud3DRuntime = lazy(async () => {
  const module = await import("./point-cloud-3d-runtime");
  return {
    default: module.PointCloud3DRuntime
  };
});

export function PointCloud3D(props: PointCloud3DProps) {
  return (
    <Suspense fallback={<PointCloud3DLoadingState prefersDark={props.prefersDark} />}>
      <PointCloud3DRuntime {...props} />
    </Suspense>
  );
}

function PointCloud3DLoadingState({ prefersDark }: { prefersDark: boolean }) {
  return (
    <div
      className={[
        "flex h-full items-center justify-center rounded-[28px] border px-6 text-center text-sm leading-6",
        prefersDark
          ? "border-slate-800 bg-slate-950/80 text-slate-400"
          : "border-slate-200 bg-white text-slate-600"
      ].join(" ")}
    >
      正在加载 3D 知识全景...
    </div>
  );
}
