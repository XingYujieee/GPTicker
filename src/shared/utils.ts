import type {
  ConversationNode,
  KeywordDatum,
  KeywordPointCloudData,
  KeywordVisualKind,
  MessageRole,
  MinimapMode
} from "./types";

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "being",
  "build",
  "button",
  "could",
  "does",
  "from",
  "have",
  "into",
  "just",
  "like",
  "main",
  "make",
  "message",
  "messages",
  "more",
  "need",
  "only",
  "please",
  "prompt",
  "return",
  "should",
  "that",
  "their",
  "there",
  "these",
  "they",
  "this",
  "those",
  "using",
  "when",
  "with",
  "would",
  "your",
  "一个",
  "一些",
  "不是",
  "以及",
  "你们",
  "功能",
  "可以",
  "如果",
  "就是",
  "我们",
  "然后",
  "请问",
  "输入",
  "这个",
  "那个"
]);

const TOKEN_PATTERNS = [
  /\b(?:[A-Z]{2,}(?:\d+)?)\b/g,
  /\b(?:[A-Za-z_][A-Za-z0-9_]*\.)+[A-Za-z_][A-Za-z0-9_]*\b/g,
  /\b[A-Za-z_][A-Za-z0-9_]{2,}\b/g,
  /[\u4e00-\u9fff]{2,}/g
] as const;

const IDENTIFIER_HINTS = /(?:[A-Z]{2,}|[a-z]+_[a-z0-9_]+|[A-Z][a-z0-9]+[A-Za-z0-9]*|[A-Za-z]+(?:\.[A-Za-z_][A-Za-z0-9_]*)+)/;
const NEBULA_START_RGB = [0 / 255, 242 / 255, 254 / 255] as const;
const NEBULA_END_RGB = [79 / 255, 172 / 255, 254 / 255] as const;
const NEBULA_CORE_RGB = [255 / 255, 170 / 255, 84 / 255] as const;
const NEBULA_CODE_RGB = [171 / 255, 123 / 255, 255 / 255] as const;
const SYSTEM_PREFIX_PATTERNS = [
  /^(?:已思考|已推理|思考用时|推理用时)[\s\u200b\ufeff_:\-：]*(?:(?:若干|几|数|约|大约|近)[\s\u200b\ufeff_]*)?(?:\d+(?:\.\d+)?)?[\s\u200b\ufeff_:\-：]*(?:秒|秒钟)[\s\u200b\ufeff_:\-：]*/i,
  /^(?:Thought|Reasoned)\s*for[\s\u200b\ufeff_:\-]*(?:[\d.]+|a while|awhile|some time)?[\s\u200b\ufeff_:\-]*(?:s|sec|secs|second|seconds)[\s\u200b\ufeff_:\-]*/i,
  /^(?:Thinking|Refining thoughts?)[\s\u200b\ufeff_:\-：]*/i,
  /^(?:你说|你问|GPT\s*(?:说|回答|回复)|ChatGPT\s*(?:说|回答|回复)|You\s*(?:said|asked)|GPT\s*(?:said|replied|answered)|ChatGPT\s*(?:said|replied|answered))\s*[:：-]?\s*/i
] as const;
const SYSTEM_LINE_PATTERNS = [
  /^(?:已思考|已推理|思考用时|推理用时)[\s\u200b\ufeff_:\-：]*(?:(?:若干|几|数|约|大约|近)[\s\u200b\ufeff_]*)?(?:\d+(?:\.\d+)?)?[\s\u200b\ufeff_:\-：]*(?:秒|秒钟)[\s\u200b\ufeff_:\-：]*$/i,
  /^(?:Thought|Reasoned)\s*for[\s\u200b\ufeff_:\-]*(?:[\d.]+|a while|awhile|some time)?[\s\u200b\ufeff_:\-]*(?:s|sec|secs|second|seconds)[\s\u200b\ufeff_:\-]*$/i,
  /^(?:Thinking|Refining thoughts?)$/i
] as const;

interface KeywordHitProfile {
  keyword: KeywordDatum;
  hits: Array<{ nodeIndex: number; score: number }>;
  hitIndices: number[];
  weightedHitCenter: number;
  weightedSpread: number;
  kind: KeywordVisualKind;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function extractKeywords(
  nodes: ConversationNode[],
  limit = 18,
  role: MessageRole = "assistant"
): KeywordDatum[] {
  const counts = new Map<string, { count: number; display: string }>();
  const sourceNodes = nodes.filter((node) => node.role === role);

  for (const node of sourceNodes) {
    for (const candidate of extractCandidates(node.content)) {
      const normalized = normalizeKeyword(candidate);

      if (!normalized || shouldSkipKeyword(candidate, normalized)) {
        continue;
      }

      const existing = counts.get(normalized);

      counts.set(normalized, {
        count: (existing?.count ?? 0) + 1,
        display: selectDisplayKeyword(existing?.display, candidate)
      });
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1].count - left[1].count)
    .slice(0, limit)
    .map(([, value]) => ({
      term: value.display,
      count: value.count
    }));
}

export function buildNodeKeywordIntensityMap(
  nodes: ConversationNode[],
  keywordTerms: string[],
  activeKeywords: string[] = []
) {
  const candidateTerms = activeKeywords.length > 0
    ? activeKeywords
    : keywordTerms.slice(0, Math.min(keywordTerms.length, 8));
  const rawScores = nodes.map((node) => ({
    id: node.id,
    score: candidateTerms.reduce(
      (total, term) => total + countKeywordOccurrences(node.content, term),
      0
    )
  }));
  const maxScore = Math.max(1, ...rawScores.map((entry) => entry.score));

  return new Map(
    rawScores.map((entry) => [
      entry.id,
      Math.min(1, entry.score / maxScore)
    ])
  );
}

export function collectMatchingNodeIds(
  nodes: ConversationNode[],
  keywords: string[]
) {
  if (keywords.length === 0) {
    return null;
  }

  return new Set(
    nodes
      .filter((node) =>
        keywords.every(
          (keyword) => countKeywordOccurrences(node.content, keyword) > 0
        )
      )
      .map((node) => node.id)
  );
}

export function countKeywordOccurrences(text: string, keyword: string) {
  const content = text.trim();
  const term = keyword.trim();

  if (!content || !term) {
    return 0;
  }

  if (/^[\u4e00-\u9fff]+$/.test(term)) {
    return countSubstringOccurrences(content, term);
  }

  const normalizedContent = content.toLowerCase();
  const normalizedTerm = normalizeKeyword(term);
  const matcher = new RegExp(`\\b${escapeRegExp(normalizedTerm)}\\b`, "g");

  return normalizedContent.match(matcher)?.length ?? 0;
}

export function stripSpeakerPrefix(content: string) {
  let normalized = normalizeSystemNoise(content).trim();

  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;

    for (const pattern of SYSTEM_PREFIX_PATTERNS) {
      const next = normalized.replace(pattern, "").trim();

      if (next !== normalized) {
        normalized = next;
        changed = true;
      }
    }

    if (!changed) {
      break;
    }
  }

  return normalized;
}

export function sanitizeConversationText(content: string) {
  const withoutSystemLines = normalizeSystemNoise(content)
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !SYSTEM_LINE_PATTERNS.some((pattern) => pattern.test(line)))
    .join("\n");

  return stripSpeakerPrefix(withoutSystemLines).replace(/\s+/g, " ").trim();
}

export function getKeywordVisualKind(
  term: string,
  count: number,
  maxCount: number
): KeywordVisualKind {
  if (count >= maxCount * 0.72) {
    return "core";
  }

  if (isCodeLikeKeyword(term)) {
    return "code";
  }

  if (
    /\b(?:concept|principle|architecture|workflow|strategy|analysis|theory|design)\b/i.test(
      term
    ) ||
    /(原理|概念|架构|机制|分析|策略|设计|思路|流程)/.test(term)
  ) {
    return "concept";
  }

  return "general";
}

function normalizeSystemNoise(content: string) {
  return content.replace(/[\u200b\ufeff]/g, "");
}

export function getMinimapNodes(
  nodes: ConversationNode[],
  mode: MinimapMode
) {
  if (mode === "all") {
    return nodes;
  }

  const userNodes = nodes.filter((node) => node.role === "user");
  return userNodes.length > 0 ? userNodes : nodes;
}

export function resolveMinimapActiveId(
  nodes: ConversationNode[],
  activeId: string | null,
  mode: MinimapMode
) {
  if (!activeId) {
    return null;
  }

  if (mode === "all") {
    return nodes.some((node) => node.id === activeId) ? activeId : null;
  }

  return resolvePromptAnchorId(nodes, activeId);
}

export function resolvePromptAnchorId(
  nodes: ConversationNode[],
  nodeId: string | null
) {
  if (!nodeId) {
    return null;
  }

  const index = nodes.findIndex((node) => node.id === nodeId);

  if (index === -1) {
    return null;
  }

  if (nodes[index].role === "user") {
    return nodes[index].id;
  }

  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (nodes[cursor].role === "user") {
      return nodes[cursor].id;
    }
  }

  for (let cursor = index + 1; cursor < nodes.length; cursor += 1) {
    if (nodes[cursor].role === "user") {
      return nodes[cursor].id;
    }
  }

  return nodes[index].id;
}

export function generateKeywordPointCloudData(
  nodes: ConversationNode[],
  keywords: KeywordDatum[],
  activeKeywords: string[] = []
): KeywordPointCloudData {
  const sourceKeywords = keywords.slice(0, 28);

  if (sourceKeywords.length === 0) {
    return {
      positions: new Float32Array(),
      colors: new Float32Array(),
      sizes: new Float32Array(),
      indices: new Float32Array(),
      active: new Float32Array(),
      accent: new Float32Array(),
      meta: [],
      links: []
    };
  }

  const lowerActive = new Set(activeKeywords.map((keyword) => normalizeKeyword(keyword)));
  const maxCount = Math.max(1, ...sourceKeywords.map((keyword) => keyword.count));
  const nodeCount = Math.max(1, nodes.length);
  const profiles = sourceKeywords.map<KeywordHitProfile>((keyword) => {
    const hits = nodes
      .map((node, nodeIndex) => ({
        nodeIndex,
        score: countKeywordOccurrences(node.content, keyword.term)
      }))
      .filter((entry) => entry.score > 0);
    const totalWeight = Math.max(
      1,
      hits.reduce((sum, entry) => sum + entry.score, 0)
    );
    const weightedHitCenter =
      hits.reduce((sum, entry) => sum + entry.nodeIndex * entry.score, 0) / totalWeight;
    const weightedSpread = Math.sqrt(
      hits.reduce(
        (sum, entry) =>
          sum + Math.pow(entry.nodeIndex - weightedHitCenter, 2) * entry.score,
        0
      ) / totalWeight
    );

    return {
      keyword,
      hits,
      hitIndices: hits.map((entry) => entry.nodeIndex),
      weightedHitCenter,
      weightedSpread,
      kind: getKeywordVisualKind(keyword.term, keyword.count, maxCount)
    };
  });
  const similarityMatrix = buildKeywordSimilarityMatrix(profiles, nodeCount);
  const links = buildKeywordPointLinks(similarityMatrix);
  const clusters = buildKeywordClusters(sourceKeywords.length, links);
  const clusterOffsets = buildClusterOffsets(clusters);
  const targets = profiles.map((profile, index) =>
    buildNebulaTargetPosition({
      profile,
      index,
      maxCount,
      nodeCount,
      clusterOffset: clusterOffsets.get(clusters[index]) ?? vec3(0, 0, 0)
    })
  );
  const positionsList = relaxNebulaPositions(targets, similarityMatrix);
  const positions = new Float32Array(sourceKeywords.length * 3);
  const colors = new Float32Array(sourceKeywords.length * 3);
  const sizes = new Float32Array(sourceKeywords.length);
  const indices = new Float32Array(sourceKeywords.length);
  const active = new Float32Array(sourceKeywords.length);
  const accent = new Float32Array(sourceKeywords.length);
  const meta: KeywordPointCloudData["meta"] = [];
  const strongestNeighborMap = new Map(
    sourceKeywords.map((_, index) => [
      index,
      Math.max(...similarityMatrix[index].filter((_, neighbor) => neighbor !== index), 0)
    ])
  );

  sourceKeywords.forEach((keyword, index) => {
    const profile = profiles[index];
    const position = positionsList[index];
    const frequencyRatio = keyword.count / maxCount;
    const strongestNeighbor = strongestNeighborMap.get(index) ?? 0;
    const isActive = lowerActive.has(normalizeKeyword(keyword.term));
    const hasAccent = profile.kind === "core" || profile.kind === "code";
    const color = selectKeywordNebulaColor({
      ratio: Math.min(1, 0.22 + frequencyRatio * 0.56 + strongestNeighbor * 0.28),
      active: isActive,
      kind: profile.kind
    });
    const size =
      16 +
      frequencyRatio * 12 +
      Math.min(2.8, strongestNeighbor * 5.2) +
      (isActive ? 4.8 : 0) +
      (hasAccent ? 2.4 : 0);
    const offset = index * 3;

    positions[offset] = position.x;
    positions[offset + 1] = position.y;
    positions[offset + 2] = position.z;
    colors[offset] = color[0];
    colors[offset + 1] = color[1];
    colors[offset + 2] = color[2];
    sizes[index] = size;
    indices[index] = index;
    active[index] = isActive ? 1 : 0;
    accent[index] = hasAccent ? 1 : 0;
    meta.push({
      term: keyword.term,
      count: keyword.count,
      index,
      cluster: clusters[index],
      cooccurrence: strongestNeighbor,
      accent: hasAccent,
      kind: profile.kind
    });
  });

  return {
    positions,
    colors,
    sizes,
    indices,
    active,
    accent,
    meta,
    links
  };
}

function extractCandidates(content: string) {
  const matches = new Set<string>();

  for (const pattern of TOKEN_PATTERNS) {
    for (const candidate of content.match(pattern) ?? []) {
      matches.add(candidate);
    }
  }

  return [...matches];
}

function normalizeKeyword(value: string) {
  return value.trim().toLowerCase();
}

function buildKeywordSimilarityMatrix(
  profiles: KeywordHitProfile[],
  nodeCount: number
) {
  const matrix = profiles.map(() => Array.from({ length: profiles.length }, () => 0));

  for (let row = 0; row < profiles.length; row += 1) {
    matrix[row][row] = 1;

    for (let column = row + 1; column < profiles.length; column += 1) {
      const overlap = measureWeightedHitOverlap(profiles[row].hits, profiles[column].hits);
      const centerAffinity =
        1 -
        Math.min(
          1,
          Math.abs(
            profiles[row].weightedHitCenter - profiles[column].weightedHitCenter
          ) / Math.max(1, nodeCount * 0.45)
        );
      const spreadAffinity =
        1 -
        Math.min(
          1,
          Math.abs(profiles[row].weightedSpread - profiles[column].weightedSpread) /
            Math.max(1, nodeCount * 0.35)
        );
      const kindAffinity = profiles[row].kind === profiles[column].kind ? 0.08 : 0;
      const similarity = Math.max(
        0,
        Math.min(
          1,
          overlap * 0.64 + centerAffinity * 0.22 + spreadAffinity * 0.08 + kindAffinity
        )
      );

      matrix[row][column] = similarity;
      matrix[column][row] = similarity;
    }
  }

  return matrix;
}

function buildKeywordPointLinks(similarityMatrix: number[][]) {
  const links: KeywordPointCloudData["links"] = [];
  const degree = Array.from({ length: similarityMatrix.length }, () => 0);
  const candidates: Array<{ from: number; to: number; weight: number }> = [];

  for (let row = 0; row < similarityMatrix.length; row += 1) {
    for (let column = row + 1; column < similarityMatrix.length; column += 1) {
      const weight = similarityMatrix[row][column];

      if (weight >= 0.2) {
        candidates.push({ from: row, to: column, weight });
      }
    }
  }

  candidates
    .sort((left, right) => right.weight - left.weight)
    .forEach((candidate) => {
      if (degree[candidate.from] >= 3 || degree[candidate.to] >= 3) {
        return;
      }

      degree[candidate.from] += 1;
      degree[candidate.to] += 1;
      links.push(candidate);
    });

  return links;
}

function buildKeywordClusters(
  nodeCount: number,
  links: KeywordPointCloudData["links"]
) {
  const adjacency = Array.from({ length: nodeCount }, () => new Set<number>());

  links
    .filter((link) => link.weight >= 0.26)
    .forEach((link) => {
      adjacency[link.from].add(link.to);
      adjacency[link.to].add(link.from);
    });

  const clusters = Array.from({ length: nodeCount }, () => -1);
  let clusterId = 0;

  for (let index = 0; index < nodeCount; index += 1) {
    if (clusters[index] !== -1) {
      continue;
    }

    const stack = [index];
    clusters[index] = clusterId;

    while (stack.length > 0) {
      const current = stack.pop()!;

      adjacency[current].forEach((neighbor) => {
        if (clusters[neighbor] !== -1) {
          return;
        }

        clusters[neighbor] = clusterId;
        stack.push(neighbor);
      });
    }

    clusterId += 1;
  }

  return clusters;
}

function buildClusterOffsets(clusters: number[]) {
  const uniqueClusters = [...new Set(clusters)];
  const offsets = new Map<number, Vec3>();

  uniqueClusters.forEach((cluster, index) => {
    const angle = (index / Math.max(1, uniqueClusters.length)) * Math.PI * 2;
    const radius = 2.6 + (index % 3) * 0.75;

    offsets.set(
      cluster,
      vec3(Math.cos(angle) * radius, (index % 2 === 0 ? 1 : -1) * 0.7, Math.sin(angle) * radius)
    );
  });

  return offsets;
}

function buildNebulaTargetPosition({
  profile,
  index,
  maxCount,
  nodeCount,
  clusterOffset
}: {
  profile: KeywordHitProfile;
  index: number;
  maxCount: number;
  nodeCount: number;
  clusterOffset: Vec3;
}) {
  const frequencyRatio = profile.keyword.count / maxCount;
  const timeRatio = profile.weightedHitCenter / Math.max(1, nodeCount - 1);
  const spreadRatio = Math.min(1, profile.weightedSpread / Math.max(1, nodeCount * 0.28));
  const identifierBoost = IDENTIFIER_HINTS.test(profile.keyword.term) ? 0.9 : 0;
  const swirl = timeRatio * Math.PI * 2.35 + seededNoise(index, 31) * 0.45;
  const radius =
    5.2 +
    (1 - frequencyRatio) * 2.4 +
    spreadRatio * 2.8 +
    (profile.kind === "general" ? 0.6 : 0);
  const verticalBand =
    (frequencyRatio - 0.5) * 6.4 +
    identifierBoost * 0.85 +
    (profile.kind === "concept" ? 1.05 : 0) -
    spreadRatio * 1.6 +
    seededNoise(index, 37) * 0.7;

  return vec3(
    Math.cos(swirl) * radius + clusterOffset.x + seededNoise(index, 41) * 0.35,
    verticalBand + clusterOffset.y,
    Math.sin(swirl) * radius * 0.95 + clusterOffset.z + seededNoise(index, 43) * 0.55
  );
}

function relaxNebulaPositions(targets: Vec3[], similarityMatrix: number[][]) {
  const positions = targets.map((target) => ({ ...target }));
  const velocities = targets.map(() => vec3(0, 0, 0));

  for (let iteration = 0; iteration < 88; iteration += 1) {
    const forces = positions.map(() => vec3(0, 0, 0));

    for (let index = 0; index < positions.length; index += 1) {
      addScaled(forces[index], subtract(targets[index], positions[index]), 0.08);
      addScaled(forces[index], positions[index], -0.018);
    }

    for (let row = 0; row < positions.length; row += 1) {
      for (let column = row + 1; column < positions.length; column += 1) {
        const delta = subtract(positions[column], positions[row]);
        const distance = Math.max(0.001, length(delta));
        const direction =
          distance < 0.001
            ? vec3(seededNoise(row, column + 51), seededNoise(column, row + 53), 0)
            : scale(delta, 1 / distance);
        const repulsion = 0.34 / (distance * distance + 0.8);
        const attractionWeight = similarityMatrix[row][column];

        addScaled(forces[row], direction, -repulsion);
        addScaled(forces[column], direction, repulsion);

        if (attractionWeight > 0.04) {
          const idealDistance = 2.8 + (1 - attractionWeight) * 7.2;
          const spring = (distance - idealDistance) * attractionWeight * 0.042;

          addScaled(forces[row], direction, spring);
          addScaled(forces[column], direction, -spring);
        }
      }
    }

    for (let index = 0; index < positions.length; index += 1) {
      velocities[index] = add(scale(velocities[index], 0.84), scale(forces[index], 0.72));
      positions[index] = add(positions[index], velocities[index]);
    }
  }

  return positions;
}

function measureHitOverlap(previousHits: number[], nextHits: number[]) {
  if (previousHits.length === 0 || nextHits.length === 0) {
    return 0;
  }

  const previous = new Set(previousHits);
  const next = new Set(nextHits);
  const intersection = [...previous].filter((hit) => next.has(hit)).length;
  const union = new Set([...previous, ...next]).size;

  return union === 0 ? 0 : intersection / union;
}

function blendNebulaColor(ratio: number, role: MessageRole) {
  const clamped = Math.min(1, Math.max(0, ratio));
  const mixed = [
    NEBULA_START_RGB[0] + (NEBULA_END_RGB[0] - NEBULA_START_RGB[0]) * clamped,
    NEBULA_START_RGB[1] + (NEBULA_END_RGB[1] - NEBULA_START_RGB[1]) * clamped,
    NEBULA_START_RGB[2] + (NEBULA_END_RGB[2] - NEBULA_START_RGB[2]) * clamped
  ];
  const brightness = role === "assistant" ? 1.16 : role === "user" ? 0.82 : 0.94;

  return mixed.map((value) => Math.min(1, value * brightness)) as [number, number, number];
}

function selectKeywordNebulaColor({
  ratio,
  active,
  kind
}: {
  ratio: number;
  active: boolean;
  kind: KeywordVisualKind;
}) {
  if (kind === "core") {
    return NEBULA_CORE_RGB.map((value) => Math.min(1, value * (active ? 1.08 : 0.96))) as [
      number,
      number,
      number
    ];
  }

  if (kind === "code") {
    return NEBULA_CODE_RGB.map((value) => Math.min(1, value * (active ? 1.08 : 0.95))) as [
      number,
      number,
      number
    ];
  }

  if (kind === "concept") {
    return [0.5, 0.82, 1].map((value) => Math.min(1, value * (active ? 1.04 : 0.92))) as [
      number,
      number,
      number
    ];
  }

  return blendNebulaColor(ratio, active ? "assistant" : "unknown");
}

function seededNoise(seed: number, salt: number) {
  const raw = Math.sin((seed + 1) * 12.9898 + salt * 78.233) * 43758.5453;

  return (raw - Math.floor(raw)) * 2 - 1;
}

function isCodeLikeKeyword(term: string) {
  return /(?:\.|_|[A-Z]{2,}|[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*|\b(?:function|class|const|import|export|return|async|await|python|react|three|shader)\b)/.test(
    term
  );
}

function measureWeightedHitOverlap(
  previousHits: Array<{ nodeIndex: number; score: number }>,
  nextHits: Array<{ nodeIndex: number; score: number }>
) {
  if (previousHits.length === 0 || nextHits.length === 0) {
    return 0;
  }

  const previous = new Map(previousHits.map((entry) => [entry.nodeIndex, entry.score]));
  const next = new Map(nextHits.map((entry) => [entry.nodeIndex, entry.score]));
  const allKeys = new Set([...previous.keys(), ...next.keys()]);
  let shared = 0;
  let total = 0;

  allKeys.forEach((key) => {
    const left = previous.get(key) ?? 0;
    const right = next.get(key) ?? 0;

    shared += Math.min(left, right);
    total += Math.max(left, right);
  });

  return total === 0 ? 0 : shared / total;
}

function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

function add(left: Vec3, right: Vec3): Vec3 {
  return vec3(left.x + right.x, left.y + right.y, left.z + right.z);
}

function subtract(left: Vec3, right: Vec3): Vec3 {
  return vec3(left.x - right.x, left.y - right.y, left.z - right.z);
}

function scale(vector: Vec3, scalar: number): Vec3 {
  return vec3(vector.x * scalar, vector.y * scalar, vector.z * scalar);
}

function addScaled(target: Vec3, vector: Vec3, scalar: number) {
  target.x += vector.x * scalar;
  target.y += vector.y * scalar;
  target.z += vector.z * scalar;
}

function length(vector: Vec3) {
  return Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);
}

function shouldSkipKeyword(raw: string, normalized: string) {
  if (normalized.length < 2 || STOP_WORDS.has(normalized)) {
    return true;
  }

  if (/^\d+$/.test(normalized)) {
    return true;
  }

  if (/^[a-z]{1,2}$/.test(normalized)) {
    return true;
  }

  if (/^[a-z]+$/.test(normalized) && !IDENTIFIER_HINTS.test(raw)) {
    return normalized.length < 4;
  }

  return false;
}

function selectDisplayKeyword(previous: string | undefined, next: string) {
  if (!previous) {
    return next;
  }

  const prevScore = scoreDisplayKeyword(previous);
  const nextScore = scoreDisplayKeyword(next);

  return nextScore > prevScore ? next : previous;
}

function scoreDisplayKeyword(value: string) {
  return Number(/[A-Z]/.test(value)) + Number(/[._]/.test(value));
}

function countSubstringOccurrences(content: string, term: string) {
  let count = 0;
  let offset = 0;

  while (offset < content.length) {
    const index = content.indexOf(term, offset);

    if (index === -1) {
      break;
    }

    count += 1;
    offset = index + term.length;
  }

  return count;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
