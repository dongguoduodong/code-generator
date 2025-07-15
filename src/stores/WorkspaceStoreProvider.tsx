"use client";

import { createContext, useContext, useRef } from "react";
import { createWorkspaceStore } from "./workspaceStore";
import type { WorkspaceState, WorkspaceStore } from "./workspaceStore";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

export const WorkspaceStoreContext = createContext<WorkspaceStore | undefined>(
  undefined
);

export const WorkspaceStoreProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const storeRef = useRef<WorkspaceStore>(undefined);
  if (!storeRef.current) {
    storeRef.current = createWorkspaceStore();
  }

  return (
    <WorkspaceStoreContext.Provider value={storeRef.current}>
      {children}
    </WorkspaceStoreContext.Provider>
  );
};

/**
 * 钩子 1: 用于响应式地选择和订阅状态。
 * 当你希望组件在所选状态变化时自动重渲染，请使用这个。
 */
export const useWorkspaceStore = <T,>(
  selector: (state: WorkspaceState) => T
): T => {
  const store = useContext(WorkspaceStoreContext);
  if (!store) {
    throw new Error(
      "useWorkspaceStore must be used within a WorkspaceStoreProvider"
    );
  }
  return useStore(store, useShallow(selector));
};

/**
 * 钩子 2: 用于获取原始的 store API (包含 getState, setState)。
 * 当你需要在事件处理器或 effect 中访问最新状态，但又不希望组件因此订阅和重渲染时，请使用这个。
 */
export const useWorkspaceStoreApi = (): WorkspaceStore => {
  const store = useContext(WorkspaceStoreContext);
  if (!store) {
    throw new Error(
      "useWorkspaceStoreApi must be used within a WorkspaceStoreProvider"
    );
  }
  return store;
};
