import { useSyncExternalStore } from "react";
import type { GPTickerController } from "../../content/bootstrap";

export function useGPTickerState(controller: GPTickerController) {
  return useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );
}
