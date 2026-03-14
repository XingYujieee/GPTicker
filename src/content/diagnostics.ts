export interface SelectorHitRecord {
  selector: string | null;
  matched: boolean;
  count?: number;
  timestamp: number;
}

export interface ObserverStatsSnapshot {
  mutationEvents: number;
  documentMutations: number;
  mainMutations: number;
  scans: number;
  lastScanAt: number | null;
  lastNodeCount: number;
}

export interface GPTickerDiagnosticsSnapshot {
  selectors: Record<string, SelectorHitRecord>;
  observer: ObserverStatsSnapshot;
}

const selectorHits = new Map<string, SelectorHitRecord>();

const observerStats: ObserverStatsSnapshot = {
  mutationEvents: 0,
  documentMutations: 0,
  mainMutations: 0,
  scans: 0,
  lastScanAt: null,
  lastNodeCount: 0
};

export function recordSelectorHit(
  key: string,
  selector: string | null,
  matched: boolean,
  count?: number
) {
  selectorHits.set(key, {
    selector,
    matched,
    count,
    timestamp: Date.now()
  });
}

export function recordObserverMutation(kind: "document" | "main") {
  observerStats.mutationEvents += 1;

  if (kind === "document") {
    observerStats.documentMutations += 1;
  } else {
    observerStats.mainMutations += 1;
  }
}

export function recordObserverScan(nodeCount: number) {
  observerStats.scans += 1;
  observerStats.lastScanAt = Date.now();
  observerStats.lastNodeCount = nodeCount;
}

export function getGPTickerDiagnosticsSnapshot(): GPTickerDiagnosticsSnapshot {
  return {
    selectors: Object.fromEntries(selectorHits.entries()),
    observer: { ...observerStats }
  };
}
