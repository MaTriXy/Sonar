/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

import {Atom} from 'flipper-plugin';
import {debounce} from 'lodash';
import {ClientNode, FrameworkEventType, Id, SnapshotInfo} from '../ClientTypes';
import {
  LiveClientState,
  SelectionSource,
  UIActions,
  UIState,
  ViewMode,
  WireFrameMode,
} from '../DesktopTypes';
import {tracker} from '../utils/tracker';
import {
  checkFocusedNodeStillActive,
  collapseinActiveChildren,
} from './ClientDataUtils';

export function uiActions(
  uiState: UIState,
  nodes: Atom<Map<Id, ClientNode>>,
  snapshot: Atom<SnapshotInfo | null>,
  liveClientData: LiveClientState,
): UIActions {
  const onExpandNode = (node: Id) => {
    uiState.expandedNodes.update((draft) => {
      draft.add(node);
    });
  };
  const onSelectNode = (node: Id | undefined, source: SelectionSource) => {
    if (
      node == null ||
      (uiState.selectedNode.get()?.id === node && source !== 'context-menu')
    ) {
      uiState.selectedNode.set(undefined);
    } else {
      uiState.selectedNode.set({id: node, source});
    }

    if (node) {
      const selectedNode = nodes.get().get(node);
      const tags = selectedNode?.tags;
      if (tags) {
        tracker.track('node-selected', {
          name: selectedNode.name,
          tags,
          source: source,
        });
      }

      let current = selectedNode?.parent;
      // expand entire ancestory in case it has been manually collapsed
      uiState.expandedNodes.update((expandedNodesDraft) => {
        while (current != null) {
          expandedNodesDraft.add(current);
          current = nodes.get().get(current)?.parent;
        }
      });
    }
  };

  const onCollapseNode = (node: Id) => {
    uiState.expandedNodes.update((draft) => {
      draft.delete(node);
    });
  };

  const onHoverNode = (...node: Id[]) => {
    if (node != null) {
      uiState.hoveredNodes.set(node);
    } else {
      uiState.hoveredNodes.set([]);
    }
  };

  const onContextMenuOpen = (open: boolean) => {
    tracker.track('context-menu-opened', {});
    uiState.isContextMenuOpen.set(open);
  };

  const onCollapseAllNonAncestors = (nodeId: Id) => {
    //this is not the simplest way to achieve this but on android there is a parent pointer missing for the decor view
    //due to the nested obversers.
    uiState.expandedNodes.update((draft) => {
      const nodesMap = nodes.get();
      let prevNode: Id | null = null;
      let curNode = nodesMap.get(nodeId);
      while (curNode != null) {
        for (const child of curNode.children) {
          if (child !== prevNode) {
            draft.delete(child);
          }
        }
        prevNode = curNode.id;
        curNode = nodesMap.get(curNode?.parent ?? 'Nonode');
      }
    });
  };

  function treeTraverseUtil(
    nodeID: Id,
    nodeVisitor: (node: ClientNode) => void,
  ) {
    const nodesMap = nodes.get();

    const node = nodesMap.get(nodeID);
    if (node != null) {
      nodeVisitor(node);
      for (const childId of node.children) {
        treeTraverseUtil(childId, nodeVisitor);
      }
    }
  }

  const onExpandAllRecursively = (nodeId: Id) => {
    uiState.expandedNodes.update((draft) => {
      treeTraverseUtil(nodeId, (node) => draft.add(node.id));
    });
  };

  const onCollapseAllRecursively = (nodeId: Id) => {
    uiState.expandedNodes.update((draft) => {
      treeTraverseUtil(nodeId, (node) => draft.delete(node.id));
    });
  };

  const onFocusNode = (node?: Id) => {
    if (node != null) {
      const focusedNode = nodes.get().get(node);
      const tags = focusedNode?.tags;
      if (tags) {
        tracker.track('node-focused', {name: focusedNode.name, tags});
      }

      uiState.selectedNode.set({id: node, source: 'visualiser'});
    }

    uiState.focusedNode.set(node);
  };

  const setVisualiserWidth = (width: number) => {
    uiState.visualiserWidth.set(width);
  };

  const onSetFilterMainThreadMonitoring = (toggled: boolean) => {
    uiState.filterMainThreadMonitoring.set(toggled);
  };

  const onSetViewMode = (viewMode: ViewMode) => {
    uiState.viewMode.set(viewMode);
  };

  const onSetWireFrameMode = (wireFrameMode: WireFrameMode) => {
    uiState.wireFrameMode.set(wireFrameMode);
  };

  const onSetFrameworkEventMonitored = (
    eventType: FrameworkEventType,
    monitored: boolean,
  ) => {
    tracker.track('framework-event-monitored', {eventType, monitored});
    uiState.frameworkEventMonitoring.update((draft) =>
      draft.set(eventType, monitored),
    );
  };

  const onPlayPauseToggled = () => {
    const isPaused = !uiState.isPaused.get();
    tracker.track('play-pause-toggled', {paused: isPaused});
    uiState.isPaused.set(isPaused);
    if (!isPaused) {
      //When going back to play mode then set the atoms to the live state to rerender the latest
      //Also need to fixed expanded state for any change in active child state
      uiState.expandedNodes.update((draft) => {
        liveClientData.nodes.forEach((node) => {
          collapseinActiveChildren(node, draft);
        });
      });
      nodes.set(liveClientData.nodes);
      snapshot.set(liveClientData.snapshotInfo);
      checkFocusedNodeStillActive(uiState, nodes.get());
    }
  };

  const searchTermUpdatedDebounced = debounce((searchTerm: string) => {
    tracker.track('search-term-updated', {searchTerm});
  }, 250);

  const onSearchTermUpdated = (searchTerm: string) => {
    uiState.searchTerm.set(searchTerm);
    searchTermUpdatedDebounced(searchTerm);
  };

  return {
    onExpandNode,
    onCollapseNode,
    onHoverNode,
    onSelectNode,
    onContextMenuOpen,
    onFocusNode,
    setVisualiserWidth,
    onSetFilterMainThreadMonitoring,
    onSetViewMode,
    onSetFrameworkEventMonitored,
    onPlayPauseToggled,
    onSearchTermUpdated,
    onSetWireFrameMode,
    onCollapseAllNonAncestors,
    onExpandAllRecursively,
    onCollapseAllRecursively,
  };
}
