import { findChatMain, findPromptTextarea, isSelectorDebugEnabled } from "./selectors";
import type { SelectorHealthState, SelectorTarget } from "../shared/types";

const HEALTH_POLL_INTERVAL_MS = 1000;
const HEALTH_DEGRADE_THRESHOLD_MS = 5000;

type HealthListener = (state: SelectorHealthState) => void;

export class SelectorHealthCheck {
  private readonly missingSince = new Map<SelectorTarget, number | null>([
    ["main", null],
    ["promptInput", null]
  ]);

  private intervalId: number | null = null;
  private state: SelectorHealthState = {
    degraded: false,
    missingTargets: [],
    checkedAt: 0,
    debugEnabled: false
  };

  constructor(private readonly listener: HealthListener) {}

  start() {
    if (this.intervalId !== null) {
      return;
    }

    this.poll();
    this.intervalId = window.setInterval(() => {
      this.poll();
    }, HEALTH_POLL_INTERVAL_MS);
  }

  stop() {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private poll() {
    const now = Date.now();
    const presence: Record<SelectorTarget, boolean> = {
      main: Boolean(findChatMain()),
      promptInput: Boolean(findPromptTextarea())
    };

    for (const target of Object.keys(presence) as SelectorTarget[]) {
      if (presence[target]) {
        this.missingSince.set(target, null);
        continue;
      }

      this.missingSince.set(target, this.missingSince.get(target) ?? now);
    }

    const missingTargets = (Object.keys(presence) as SelectorTarget[]).filter((target) => {
      const startedAt = this.missingSince.get(target);

      return (
        presence[target] === false &&
        typeof startedAt === "number" &&
        now - startedAt >= HEALTH_DEGRADE_THRESHOLD_MS
      );
    });

    const nextState: SelectorHealthState = {
      degraded: missingTargets.length > 0,
      missingTargets,
      checkedAt: now,
      debugEnabled: isSelectorDebugEnabled()
    };

    if (!isSameHealthState(this.state, nextState)) {
      this.state = nextState;
      this.listener(nextState);
    }
  }
}

function isSameHealthState(
  left: SelectorHealthState,
  right: SelectorHealthState
) {
  return (
    left.degraded === right.degraded &&
    left.debugEnabled === right.debugEnabled &&
    left.missingTargets.length === right.missingTargets.length &&
    left.missingTargets.every((target, index) => target === right.missingTargets[index])
  );
}
