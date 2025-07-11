import { create } from "zustand";
import type { WebContainer } from "@webcontainer/api";
import type { Terminal } from "xterm";
import type { Ignore } from "ignore";
import { FileTreeNode } from "@/types/webcontainer";
import { OperationStatusType, RenderNode, FileOperation } from "@/types/ai";
import {
  createFile,
  updateFileContent,
  deleteFileOrDirectory,
} from "@/app/projects/[project_id]/utils/fileSystem";
import { toast } from "sonner";
import { apiClient } from "@/lib/apiClient";
import { executeFileInstruction } from "@/app/projects/[project_id]/hooks/useFileExecutor";
import { executeTerminalInstruction } from "@/app/projects/[project_id]/utils/terminal";

const saveOperationsToDb = async (
  projectId: string,
  operations: FileOperation[]
) => {
  if (!operations.length || !projectId) return;
  try {
    await apiClient(`/api/projects/${projectId}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operations, projectId }),
    });
  } catch (e) {
    console.error("Failed to save operations to DB:", e);
    toast.error("同步文件到数据库失败。");
    throw e;
  }
};

interface WorkspaceActions {
  setWebcontainer: (
    instance: WebContainer | null,
    projectId: string | null
  ) => void;
  setTerminal: (instance: Terminal | null) => void;
  setGitignoreParser: (parser: Ignore) => void;
  setExecutionError: (error: string | null) => void;
  setFileSystem: (fs: FileTreeNode[]) => void;
  setActiveFile: (path: string | null, content?: string) => void;
  setEditorContent: (content: string) => void;
  setPreviewUrl: (url: string) => void;
  setAiStatus: (status: string) => void;
  createFileNode: (path: string, content: string) => void;
  updateFileNodeContent: (path: string, content: string) => void;
  deleteFileNode: (path: string) => void;
  enqueueInstructions: (nodes: RenderNode[], projectId: string) => void;
  updateOperationStatus: (id: string, status: OperationStatusType) => void;
  resetOperationStatuses: () => void;
  resetWorkspace: () => void;
  setInitialAiCallFired: () => void;
}

interface WorkspaceState {
  webcontainer: WebContainer | null;
  terminal: Terminal | null;
  gitignoreParser: Ignore | null;
  executionError: string | null;
  fileSystem: FileTreeNode[];
  activeFile: string | null;
  editorContent: string;
  previewUrl: string;
  isLoadingContainer: boolean;
  aiStatus: string;
  instructionQueue: { instruction: RenderNode; projectId: string }[];
  operationStatuses: Record<string, OperationStatusType>;
  isProcessing: boolean;
  initialAiCallFired: boolean;
  currentProjectId: string | null;
  actions: WorkspaceActions;
}

const getInitialState = (): Omit<WorkspaceState, "actions"> => ({
  webcontainer: null,
  terminal: null,
  gitignoreParser: null,
  executionError: null,
  fileSystem: [],
  activeFile: null,
  editorContent: "",
  previewUrl: "",
  isLoadingContainer: true,
  aiStatus: "AI 正在待命...",
  instructionQueue: [],
  operationStatuses: {},
  isProcessing: false,
  initialAiCallFired: false,
  currentProjectId: null,
});

export const useWorkspaceStore = create<WorkspaceState>((set, get) => {
  const processQueue = async () => {
    const { isProcessing, instructionQueue, webcontainer, terminal, actions } =
      get();

    if (
      isProcessing ||
      instructionQueue.length === 0 ||
      !webcontainer ||
      !terminal
    ) {
      return;
    }

    set({ isProcessing: true });

    while (get().instructionQueue.length > 0) {
      const { instruction, projectId } = get().instructionQueue[0];

      try {
        actions.updateOperationStatus(instruction.id, "executing");
        actions.setAiStatus(
          `正在执行: ${
            instruction.type === "file"
              ? `${instruction.action} ${instruction.path}`
              : instruction.type === "terminal"
              ? instruction.command
              : ""
          }`
        );

        let result;
        if (instruction.type === "file") {
          result = await executeFileInstruction(instruction, {
            webcontainer,
            projectId,
            saveOperationsToDb,
          });
        } else if (instruction.type === "terminal") {
          if (instruction.background) {
            terminal.write(
              `\r\n\x1b[1;36m$ (bg) \x1b[0m${instruction.command}\r\n`
            );
            const [cmd, ...args] = instruction.command
              .split(/\s+/)
              .filter(Boolean);
            const process = await webcontainer.spawn(cmd, args);
            process.output.pipeTo(
              new WritableStream({
                write(data) {
                  terminal.write(data);
                },
              })
            );
            process.exit.then((exitCode) => {
              terminal.write(
                `\r\n\x1b[1;33mBackground process exited with code ${exitCode}\x1b[0m\r\n`
              );
            });
            result = { success: true };
          } else {
            result = await executeTerminalInstruction(instruction, {
              webcontainer,
              terminal,
            });
          }
        } else {
          result = { success: true };
        }

        if (result.success) {
          if (instruction.type === "file") {
            const { path, action, content } = instruction;
            switch (action) {
              case "create":
                actions.createFileNode(path, content);
                break;
              case "update":
                actions.updateFileNodeContent(path, content);
                break;
              case "delete":
                actions.deleteFileNode(path);
                break;
            }
            if (action !== "delete") {
              actions.setActiveFile(path, content);
            } else if (get().activeFile === path) {
              actions.setActiveFile(null, "");
            }
          }
          actions.updateOperationStatus(instruction.id, "completed");
        } else {
          throw new Error(result.error || "未知执行错误");
        }
      } catch (e: unknown) {
        const error = e instanceof Error ? e.message : String(e);
        actions.updateOperationStatus(instruction.id, "error");
        actions.setExecutionError(error);
        toast.error(`指令执行失败`, { description: error });
      } finally {
        set((state) => ({ instructionQueue: state.instructionQueue.slice(1) }));
      }
    }

    set({ isProcessing: false, aiStatus: "AI 已完成所有任务，正在待命..." });
  };

  return {
    ...getInitialState(),
    actions: {
      setWebcontainer: (instance, projectId) => {
        set({
          webcontainer: instance,
          isLoadingContainer: !instance,
          currentProjectId: instance ? projectId : null,
        });
      },
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
        const wc = get().webcontainer;
        wc?.teardown();
        set(getInitialState());
      },
      updateOperationStatus: (id, status) =>
        set((state) => ({
          operationStatuses: { ...state.operationStatuses, [id]: status },
        })),
      setInitialAiCallFired: () => set({ initialAiCallFired: true }),
      enqueueInstructions: (nodes, projectId) => {
        const newQueueItems = nodes.map((instruction) => ({
          instruction,
          projectId,
        }));
        set((state) => ({
          instructionQueue: [...state.instructionQueue, ...newQueueItems],
        }));

        // 延迟调用，确保状态更新后再执行
        setTimeout(processQueue, 0);
      },
    },
  };
});
