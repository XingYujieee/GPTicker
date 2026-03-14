import { useDeferredValue, useState } from "react";
import { deletePromptVaultItem, upsertPromptVaultItem } from "../shared/storage";
import { sortPromptVaultItemsByTags } from "../shared/tags";
import type { GPTickerController } from "../content/bootstrap";
import {
  buildNodeKeywordIntensityMap,
  collectMatchingNodeIds,
  extractKeywords,
  getMinimapNodes,
  resolveMinimapActiveId,
  resolvePromptAnchorId
} from "../shared/utils";
import { SidebarShell } from "./components/sidebar-shell";
import { useGPTickerState } from "./hooks/use-gpticker-state";
import type {
  ConversationNode,
  MinimapMode,
  PromptVaultDraft
} from "../shared/types";

interface AppProps {
  controller: GPTickerController;
}

export function App({ controller }: AppProps) {
  const state = useGPTickerState(controller);
  const [minimapMode, setMinimapMode] = useState<MinimapMode>("questions");
  const deferredNodes = useDeferredValue(state.nodes);
  const deferredKeywords = useDeferredValue(state.activeKeywords);
  const keywords = extractKeywords(deferredNodes);
  const prioritizedPrompts = sortPromptVaultItemsByTags(
    state.prompts,
    state.session.tags
  );
  const effectiveMinimapMode: MinimapMode =
    minimapMode === "questions" &&
    deferredNodes.some((node) => node.role === "user")
      ? "questions"
      : "all";
  const minimapNodes = getMinimapNodes(deferredNodes, effectiveMinimapMode);
  const rawMatchingNodeIds = collectMatchingNodeIds(
    deferredNodes,
    deferredKeywords
  );
  const rawKeywordIntensity = buildNodeKeywordIntensityMap(
    deferredNodes,
    keywords.map((keyword) => keyword.term),
    deferredKeywords
  );
  const matchingNodeIds = mapMinimapMatches(
    rawMatchingNodeIds,
    deferredNodes,
    effectiveMinimapMode
  );
  const keywordIntensity = mapMinimapKeywordIntensity(
    minimapNodes,
    rawKeywordIntensity,
    deferredNodes,
    effectiveMinimapMode
  );
  const activeMinimapId = resolveMinimapActiveId(
    deferredNodes,
    state.activeId,
    effectiveMinimapMode
  );

  const handleSavePrompt = async (draft: PromptVaultDraft) => {
    const nextPrompts = upsertPromptVaultItem(state.prompts, draft);
    await controller.persistPromptVault(nextPrompts);
  };

  const handleDeletePrompt = async (id: string) => {
    const nextPrompts = deletePromptVaultItem(state.prompts, id);
    await controller.persistPromptVault(nextPrompts);
  };

  return (
    <SidebarShell
      conversationNodes={deferredNodes}
      nodes={minimapNodes}
      activeId={activeMinimapId}
      activeKeywords={state.activeKeywords}
      minimapMode={effectiveMinimapMode}
      drawerOpen={state.drawerOpen}
      ui={state.ui}
      prompts={prioritizedPrompts}
      keywords={keywords}
      session={state.session}
      selectorHealth={state.selectorHealth}
      matchingNodeIds={matchingNodeIds}
      keywordIntensity={keywordIntensity}
      onSelectNode={controller.scrollToNode}
      onSetMinimapMode={setMinimapMode}
      onToggleDrawer={controller.toggleDrawer}
      onSetMinimized={controller.setMinimized}
      onPersistPanelPosition={controller.persistPanelPosition}
      onToggleKeyword={controller.toggleKeywordFilter}
      onClearKeyword={controller.clearKeywordFilter}
      onSaveSessionTags={controller.persistSessionTags}
      onExportMarkdown={controller.exportConversation}
      onSavePrompt={handleSavePrompt}
      onDeletePrompt={handleDeletePrompt}
      onUsePrompt={controller.applyPrompt}
      onCopyPrompt={controller.copyPrompt}
    />
  );
}

function mapMinimapMatches(
  matchingNodeIds: ReadonlySet<string> | null,
  nodes: ConversationNode[],
  mode: MinimapMode
) {
  if (matchingNodeIds === null) {
    return null;
  }

  if (mode === "all") {
    return matchingNodeIds;
  }

  const displayIds = new Set<string>();

  for (const nodeId of matchingNodeIds) {
    const promptId = resolvePromptAnchorId(nodes, nodeId);

    if (promptId) {
      displayIds.add(promptId);
    }
  }

  return displayIds;
}

function mapMinimapKeywordIntensity(
  minimapNodes: ConversationNode[],
  rawIntensity: ReadonlyMap<string, number>,
  nodes: ConversationNode[],
  mode: MinimapMode
) {
  if (mode === "all") {
    return new Map(rawIntensity);
  }

  const mapped = new Map(minimapNodes.map((node) => [node.id, 0]));

  for (const [nodeId, intensity] of rawIntensity.entries()) {
    const promptId = resolvePromptAnchorId(nodes, nodeId);

    if (!promptId) {
      continue;
    }

    const previous = mapped.get(promptId) ?? 0;
    mapped.set(promptId, Math.max(previous, intensity));
  }

  return mapped;
}
