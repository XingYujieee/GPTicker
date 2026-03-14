import type { PromptVaultItem } from "./types";

export function canonicalizeTag(input: string) {
  return input
    .trim()
    .replace(/^#+/, "")
    .replace(/[^\p{L}\p{N}_-]+/gu, "")
    .slice(0, 32);
}

export function parseTagInput(input: string) {
  const matches = input.match(/#[^\s#,，]+|[^,\n，\s]+/g) ?? [];

  return uniqueTags(matches.map((value) => canonicalizeTag(value)).filter(Boolean));
}

export function formatTagLabel(tag: string) {
  return tag.startsWith("#") ? tag : `#${tag}`;
}

export function tagsToInput(tags: string[]) {
  return tags.map((tag) => formatTagLabel(tag)).join(", ");
}

export function sortPromptVaultItemsByTags(
  items: PromptVaultItem[],
  sessionTags: string[]
) {
  const sessionKeys = new Set(sessionTags.map((tag) => normalizeTagKey(tag)));

  return [...items].sort((left, right) => {
    const scoreDelta =
      getTagMatchScore(right.tags, sessionKeys) - getTagMatchScore(left.tags, sessionKeys);

    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return right.updatedAt - left.updatedAt;
  });
}

export function getTagMatchScore(
  tags: string[],
  activeTags: string[] | Set<string>
) {
  const activeTagSet =
    activeTags instanceof Set
      ? activeTags
      : new Set(activeTags.map((tag) => normalizeTagKey(tag)));

  return uniqueTags(tags)
    .map((tag) => normalizeTagKey(tag))
    .filter((tag) => activeTagSet.has(tag)).length;
}

export function uniqueTags(tags: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const tag of tags) {
    const canonical = canonicalizeTag(tag);

    if (!canonical) {
      continue;
    }

    const key = normalizeTagKey(canonical);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(canonical);
  }

  return result;
}

export function normalizeTagKey(tag: string) {
  return canonicalizeTag(tag).toLowerCase();
}
