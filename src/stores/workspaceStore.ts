"use client"
import type { WebContainer } from "@webcontainer/api"
import type { Terminal } from "xterm"
import type { Ignore } from "ignore"

import type { FileTreeNode } from "@/types/webcontainer"
import type { OperationStatusType, RenderNode } from "@/types/ai"
import {
  createFile,
  updateFileContent,
  deleteFileOrDirectory,
} from "@/app/projects/[project_id]/utils/fileSystem"
import { create } from "zustand"
import { resetBootPromise } from "@/app/projects/[project_id]/hooks/useWebContainer"

export interface DevError {
  id: string
  log: string
  timestamp: number
  status: "active" | "dismissed"
}

export interface WorkspaceState {
  webcontainer: WebContainer | null
  terminal: Terminal | null
  gitignoreParser: Ignore | null
  executionError: string | null
  fileSystem: FileTreeNode[]
  activeFile: string | null
  editorContent: string
  previewUrl: string
  aiStatus: string
  instructionQueue: { instruction: RenderNode; projectId: string }[]
  operationStatuses: Record<string, OperationStatusType>
  isProcessing: boolean
  currentProjectId: string | null
  devErrors: DevError[]
  performanceMetrics: PerformanceMetrics
  activeWorkspaceTab: "code" | "preview"
  actions: WorkspaceActions
}

export interface PerformanceMetrics {
  lastRequestDuration: number | null
  routerDecisionTime: number | null
  preJudgmentTime: number | null
  timeToFirstToken: number | null
  fullResponseTime: number | null
}

/**
 * Defines the actions available for manipulating the workspace state.
 * In the refactored architecture, these are primarily simple, synchronous state setters.
 * The complex asynchronous logic (command execution, queue processing) has been moved
 * to the dedicated WorkspaceService.
 */
export interface WorkspaceActions {
  setWebcontainer: (
    instance: WebContainer | null,
    projectId: string | null
  ) => void
  setTerminal: (instance: Terminal | null) => void
  setGitignoreParser: (parser: Ignore) => void
  setExecutionError: (error: string | null) => void
  setFileSystem: (fs: FileTreeNode[]) => void
  setActiveFile: (path: string | null, content?: string) => void
  setEditorContent: (content: string) => void
  setPreviewUrl: (url: string) => void
  setAiStatus: (status: string) => void
  createFileNode: (path: string, content: string) => void
  updateFileNodeContent: (path: string, content: string) => void
  deleteFileNode: (path: string) => void
  updateOperationStatus: (id: string, status: OperationStatusType) => void
  resetOperationStatuses: () => void
  resetWorkspace: () => void
  addDevError: (log: string) => void
  dismissDevError: (errorId: string) => void
  clearAllDevErrors: () => void
  clearCompilationErrors: () => void
  setPerformanceMetrics: (metrics: Partial<PerformanceMetrics>) => void
  setActiveWorkspaceTab: (tab: "code" | "preview") => void
  // Actions for the service layer to call
  setIsProcessing: (isProcessing: boolean) => void
  setInstructionQueue: (
    queue: { instruction: RenderNode; projectId: string }[]
  ) => void
}

const initialState: Omit<WorkspaceState, "actions"> = {
  webcontainer: null,
  terminal: null,
  gitignoreParser: null,
  executionError: null,
  fileSystem: [],
  activeFile: null,
  editorContent: "",
  previewUrl: "",
  aiStatus: "",
  instructionQueue: [],
  operationStatuses: {},
  isProcessing: false,
  currentProjectId: null,
  devErrors: [],
  performanceMetrics: {
    lastRequestDuration: null,
    routerDecisionTime: null,
    preJudgmentTime: null,
    timeToFirstToken: null,
    fullResponseTime: null,
  },
  activeWorkspaceTab: "code",
}

export const createWorkspaceStore = () => {
  return create<WorkspaceState>()((set, get) => ({
    ...initialState,
    actions: {
      setWebcontainer: (instance, projectId) =>
        set({
          webcontainer: instance,
          currentProjectId: instance ? projectId : null,
        }),
      setTerminal: (instance) => set({ terminal: instance }),
      setGitignoreParser: (parser) => set({ gitignoreParser: parser }),
      setExecutionError: (error) => set({ executionError: error }),
      setFileSystem: (fs) => set({ fileSystem: fs }),
      setActiveFile: (path, content) =>
        set({
          activeFile: path,
          editorContent: content ?? get().editorContent,
        }),
      setEditorContent: (content) => set({ editorContent: content }),
      setPreviewUrl: (url) => set({ previewUrl: url }),
      setAiStatus: (status) => set({ aiStatus: status }),
      createFileNode: (path, content) =>
        set((state) => ({
          fileSystem: createFile(state.fileSystem, path, content),
        })),
      updateFileNodeContent: (path, content) =>
        set((state) => ({
          fileSystem: updateFileContent(state.fileSystem, path, content),
        })),
      deleteFileNode: (path) =>
        set((state) => ({
          fileSystem: deleteFileOrDirectory(state.fileSystem, path),
        })),
      resetOperationStatuses: () => set({ operationStatuses: {} }),
      resetWorkspace: () => {
        const wc = get().webcontainer
        if (wc) {
          wc.teardown()
        }
        resetBootPromise()
        set(initialState)
      },
      updateOperationStatus: (id, status) =>
        set((state) => ({
          operationStatuses: { ...state.operationStatuses, [id]: status },
        })),
      addDevError: (log) => {
        set((state) => {
          const existingError = state.devErrors.find((e) => e.log === log)
          if (existingError) {
            return {
              devErrors: state.devErrors.map((e) =>
                e.id === existingError.id ? { ...e, status: "active" } : e
              ),
            }
          } else {
            const newError: DevError = {
              id: `err-${Date.now()}-${Math.random()}`,
              log,
              timestamp: Date.now(),
              status: "active",
            }
            return { devErrors: [...state.devErrors, newError] }
          }
        })
      },
      dismissDevError: (errorId) => {
        set((state) => ({
          devErrors: state.devErrors.map((e) =>
            e.id === errorId ? { ...e, status: "dismissed" } : e
          ),
        }))
      },
      clearAllDevErrors: () => set({ devErrors: [] }),
      clearCompilationErrors: () => {
        set((state) => ({
          devErrors: state.devErrors.map((e) =>
            e.status === "active" ? { ...e, status: "dismissed" } : e
          ),
        }))
      },
      setPerformanceMetrics: (metrics) =>
        set((state) => ({
          performanceMetrics: { ...state.performanceMetrics, ...metrics },
        })),
      setActiveWorkspaceTab: (tab) => set({ activeWorkspaceTab: tab }),
      setIsProcessing: (isProcessing) => set({ isProcessing }),
      setInstructionQueue: (queue) => set({ instructionQueue: queue }),
    },
  }))
}

export type WorkspaceStore = ReturnType<typeof createWorkspaceStore>
