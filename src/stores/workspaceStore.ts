"use client"
import type { WebContainer } from "@webcontainer/api"
import type { Terminal } from "xterm"
import type { Ignore } from "ignore"
import { toast } from "sonner"
import stripAnsi from "strip-ansi"

import type { FileTreeNode } from "@/types/webcontainer"
import type { OperationStatusType, RenderNode, FileOperation } from "@/types/ai"
import { apiClient } from "@/lib/apiClient"
import {
  createFile,
  updateFileContent,
  deleteFileOrDirectory,
} from "@/app/projects/[project_id]/utils/fileSystem"
import { executeFileInstruction } from "@/app/projects/[project_id]/hooks/useFileExecutor"
import { handleProcess } from "@/app/projects/[project_id]/utils/processHandler"
import { create } from "zustand"

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
  isLoadingContainer: boolean
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
  lastRequestDuration: number | null // 后端API总耗时
  routerDecisionTime: number | null // Router Agent耗时
  preJudgmentTime: number | null // 本地快速决策耗时
  timeToFirstToken: number | null // 客户端TTFT
  fullResponseTime: number | null // 客户端完整响应时间
}

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
  enqueueInstructions: (nodes: RenderNode[], projectId: string) => void
  updateOperationStatus: (id: string, status: OperationStatusType) => void
  resetOperationStatuses: () => void
  resetWorkspace: () => void
  addDevError: (log: string) => void
  dismissDevError: (errorId: string) => void
  clearAllDevErrors: () => void
  clearCompilationErrors: () => void
  runCommand: (command: string, args: string[]) => Promise<void>
  runBackgroundTask: (command: string, args: string[]) => void
  startInteractiveShell: () => void
  setPerformanceMetrics: (metrics: Partial<PerformanceMetrics>) => void
  setActiveWorkspaceTab: (tab: "code" | "preview") => void
}

const saveOperationsToDb = async (
  projectId: string,
  operations: FileOperation[]
) => {
  if (!operations.length || !projectId) return
  try {
    await apiClient(`/api/projects/${projectId}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operations, projectId }),
    })
  } catch (e) {
    console.error("Failed to save operations to DB:", e)
    toast.error("同步文件到数据库失败。")
    throw e
  }
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
  isLoadingContainer: true,
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
  return create<WorkspaceState>()((set, get) => {
    const runCommandAsync = async (
      command: string,
      args: string[]
    ): Promise<void> => {
      const { webcontainer, terminal } = get()
      if (!webcontainer || !terminal)
        throw new Error("环境未就绪，无法执行命令。")

      const fullCommand = `${command} ${args.join(" ")}`

      terminal.write(`\r\n\x1b[1;32m$ \x1b[0m${fullCommand}\r\n`)

      const process = await webcontainer.spawn(command, args)
      const { exitCode, output } = await handleProcess(process, { terminal })

      if (exitCode !== 0) {
        throw new Error(
          `命令失败，退出码 ${exitCode}.\n输出:\n${stripAnsi(output)}`
        )
      }
    }

    const runBackgroundTaskAsync = async (command: string, args: string[]) => {
      const { webcontainer, terminal, actions } = get()
      if (!webcontainer || !terminal) {
        toast.error("环境未就绪，无法执行后台任务。")
        return
      }

      const fullCommand = `${command} ${args.join(" ")}`

      // --- 核心增强逻辑 (同样应用在此处) ---
      terminal.write(`\r\n\x1b[1;32m$ \x1b[0m${fullCommand}\r\n`)
      // ---------------------------------

      const process = await webcontainer.spawn(command, args)
      handleProcess(process, {
        terminal,
        onSuccess: () => actions.clearCompilationErrors(),
        errorCheck: {
          regex: /error|failed|exception|unhandled|could not be resolved/i,
          onDetection: (cleanedLog) => actions.addDevError(cleanedLog),
        },
      }).then(({ exitCode }) => {
        terminal.write(
          `\r\n\x1b[1;33m后台进程已退出，退出码: ${exitCode}\x1b[0m\r\n`
        )
      })
    }

    const startInteractiveShellAsync = async (): Promise<void> => {
      const { webcontainer, terminal } = get()
      if (!webcontainer || !terminal) return

      const shellProcess = await webcontainer.spawn("jsh", {
        terminal: { cols: terminal.cols, rows: terminal.rows },
      })
      shellProcess.output.pipeTo(
        new WritableStream({ write: (data) => terminal.write(data) })
      )
      const writer = shellProcess.input.getWriter()
      terminal.onData((data) => writer.write(data))
    }

    const processQueue = async () => {
      const { isProcessing, instructionQueue, webcontainer, terminal } = get()
      if (
        isProcessing ||
        instructionQueue.length === 0 ||
        !webcontainer ||
        !terminal
      )
        return

      set({ isProcessing: true })

      while (get().instructionQueue.length > 0) {
        const { instruction, projectId } = get().instructionQueue[0]
        try {
          get().actions.updateOperationStatus(instruction.id, "executing")
          get().actions.setAiStatus(
            `正在执行: ${
              instruction.type === "file"
                ? `${instruction.action} ${instruction.path}`
                : instruction.type === "terminal"
                ? instruction.command
                : ""
            }`
          )

          let result: { success: boolean; error?: string } = { success: true }
          if (instruction.type === "file") {
            result = await executeFileInstruction(instruction, {
              webcontainer,
              projectId,
              saveOperationsToDb,
            })
          } else if (instruction.type === "terminal") {
            const [cmd, ...args] = instruction.command
              .split(/\s+/)
              .filter(Boolean)
            if (instruction.background) {
              get().actions.runBackgroundTask(cmd, args)
            } else {
              await get().actions.runCommand(cmd, args)
            }
          }

          if (result.success) {
            if (instruction.type === "file") {
              const { path, action, content } = instruction
              switch (action) {
                case "create":
                  get().actions.createFileNode(path, content)
                  break
                case "update":
                  get().actions.updateFileNodeContent(path, content)
                  break
                case "delete":
                  get().actions.deleteFileNode(path)
                  break
              }
              if (action !== "delete")
                get().actions.setActiveFile(path, content)
              else if (get().activeFile === path)
                get().actions.setActiveFile(null, "")
            }
            get().actions.updateOperationStatus(instruction.id, "completed")
          } else {
            throw new Error(result.error || "未知执行错误")
          }
        } catch (e: unknown) {
          const error = e instanceof Error ? e.message : String(e)
          get().actions.updateOperationStatus(instruction.id, "error")
          get().actions.setExecutionError(error)
          toast.error(`指令执行失败`, { description: error })
        } finally {
          set((state) => ({
            instructionQueue: state.instructionQueue.slice(1),
          }))
        }
      }

      get().actions.clearAllDevErrors()
      set({ isProcessing: false, aiStatus: "AI 已完成所有任务，正在待命..." })
    }

    // --- 返回最终的 Store 对象 ---

    return {
      ...initialState,
      actions: {
        setWebcontainer: (instance, projectId) =>
          set({
            webcontainer: instance,
            isLoadingContainer: !instance,
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
          get().webcontainer?.teardown()
          set(initialState)
        },
        updateOperationStatus: (id, status) =>
          set((state) => ({
            operationStatuses: { ...state.operationStatuses, [id]: status },
          })),
        enqueueInstructions: (nodes, projectId) => {
          const newQueueItems = nodes.map((instruction) => ({
            instruction,
            projectId,
          }))
          set((state) => ({
            instructionQueue: [...state.instructionQueue, ...newQueueItems],
          }))
          setTimeout(processQueue, 0)
        },
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
        runCommand: runCommandAsync,
        runBackgroundTask: runBackgroundTaskAsync,
        startInteractiveShell: startInteractiveShellAsync,
        setPerformanceMetrics: (metrics) =>
          set((state) => ({
            performanceMetrics: { ...state.performanceMetrics, ...metrics },
          })),
        setActiveWorkspaceTab: (tab) => set({ activeWorkspaceTab: tab }),
      },
    }
  })
}

export type WorkspaceStore = ReturnType<typeof createWorkspaceStore>
