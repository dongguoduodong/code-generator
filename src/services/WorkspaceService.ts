import { WebContainer, WebContainerProcess } from "@webcontainer/api"
import { Terminal } from "xterm"
import { toast } from "sonner"

import type { WorkspaceStore } from "@/stores/workspaceStore"
import type { RenderNode, FileOperation } from "@/types/ai"
import { apiClient } from "@/lib/apiClient"
import { handleProcess } from "@/app/projects/[project_id]/utils/processHandler"

/**
 * WorkspaceService 负责编排和执行所有与 WebContainer 和 AI 指令相关的复杂业务逻辑。
 * 它作为一个独立的服务层，将执行逻辑与 Zustand 状态管理完全解耦。
 *
 * 职责:
 * - 启动并管理一个持久化的、交互式的 Shell 进程。
 * - 管理一个 AI 指令执行队列。
 * - 与 WebContainer 实例交互以执行文件操作和终端命令。
 * - 在执行过程中，通过调用 Zustand store 的 actions 来向 UI 报告状态更新。
 * - 统一处理执行过程中的错误。
 */
export class WorkspaceService {
  private instructionQueue: { instruction: RenderNode; projectId: string }[] =
    []
  private isProcessingQueue = false
  private webcontainer: WebContainer | null = null
  private terminal: Terminal | null = null
  private interactiveProcess: WebContainerProcess | null = null
  // ✨ MODIFICATION START: 添加一个属性来持有交互式Shell的写入器
  private shellWriter: WritableStreamDefaultWriter<string> | null = null
  // ✨ MODIFICATION END
  private store: WorkspaceStore

  constructor(store: WorkspaceStore) {
    this.store = store
  }

  public setDependencies(wc: WebContainer, term: Terminal) {
    this.webcontainer = wc
    this.terminal = term

    term.onResize(({ cols, rows }) => {
      if (this.interactiveProcess) {
        this.interactiveProcess.resize({ cols, rows })
      }
    })
    this.processQueue()
  }

  /**
   * ✨ [核心重构] 启动并管理一个长期运行的、交互式的 shell。
   * 这个方法是非阻塞的。它会启动进程，然后立即返回，让用户可以交互。
   */
  public async launchInteractiveShell(): Promise<void> {
    if (!this.webcontainer || !this.terminal) {
      toast.error("无法启动终端：环境未完全初始化。")
      return
    }

    if (this.interactiveProcess) {
      await this.interactiveProcess.kill()
      this.interactiveProcess = null
      this.shellWriter = null
    }

    this.terminal.reset()
    this.terminal.write(
      "\r\n\x1b[1;34mWelcome to the WebContainer shell! (jsh)\x1b[0m\r\n"
    )

    const shellProcess = await this.webcontainer.spawn("jsh", [], {
      terminal: {
        cols: this.terminal.cols,
        rows: this.terminal.rows,
      },
    })
    this.interactiveProcess = shellProcess

    // ✨ MODIFICATION START: 获取并存储写入器
    this.shellWriter = shellProcess.input.getWriter()
    // ✨ MODIFICATION END

    shellProcess.output.pipeTo(
      new WritableStream({
        write: (data) => this.terminal!.write(data),
      })
    )
    
    // 绑定用户在前端终端的输入到shell进程
    const onDataDisposable = this.terminal.onData((data) => {
      this.shellWriter!.write(data)
    })

    shellProcess.exit.then((exitCode) => {
      this.terminal!.write(
        `\r\n\x1b[1;31mShell exited with code: ${exitCode}\x1b[0m\r\n`
      )
      onDataDisposable.dispose()
      if (this.interactiveProcess === shellProcess) {
        this.interactiveProcess = null
        this.shellWriter = null
      }
    })
  }

  public enqueueInstructions(nodes: RenderNode[], projectId: string) {
    const newItems = nodes.map((instruction) => ({ instruction, projectId }))
    this.instructionQueue.push(...newItems)
    this.store.getState().actions.setInstructionQueue(this.instructionQueue)
    this.processQueue()
  }

  private async processQueue() {
    if (
      this.isProcessingQueue ||
      this.instructionQueue.length === 0 ||
      !this.webcontainer ||
      !this.terminal
    ) {
      return
    }

    this.isProcessingQueue = true
    this.store.getState().actions.setIsProcessing(true)
    this.store.getState().actions.setAiStatus("开始执行AI指令...")

    while (this.instructionQueue.length > 0) {
      const { instruction, projectId } = this.instructionQueue[0]
      const { actions } = this.store.getState()

      try {
        actions.updateOperationStatus(instruction.id, "executing")
        actions.setAiStatus(
          `正在执行: ${this.getInstructionDescription(instruction)}`
        )

        let result: { success: boolean; error?: string } = { success: true }

        if (instruction.type === "file") {
          result = await this._executeFileInstruction(instruction, projectId)
        } else if (instruction.type === "terminal") {
          // ✨ MODIFICATION START: 改造终端命令执行逻辑
          if (instruction.background) {
            // 背景任务保持原来的 spawn 逻辑
            const [cmd, ...args] = instruction.command.split(/\s+/).filter(Boolean)
            this._runBackgroundTask(cmd, args)
          } else {
            // 前台任务，注入到交互式Shell中
            if (!this.shellWriter) {
                throw new Error("交互式 Shell 不可用，无法执行前台命令。");
            }
            // 模拟用户输入命令并按回车
            await this.shellWriter.write(`${instruction.command}\r\n`);
          }
          // ✨ MODIFICATION END
        }

        if (result.success) {
          if (instruction.type === "file") {
            const { path, action, content } = instruction
            if (!path || !action) throw new Error("指令无效: 缺少路径或操作")

            switch (action) {
              case "create":
                actions.createFileNode(path, content)
                break
              case "update":
                actions.updateFileNodeContent(path, content)
                break
              case "delete":
                actions.deleteFileNode(path)
                break
            }

            if (action !== "delete") actions.setActiveFile(path, content)
            else if (this.store.getState().activeFile === path)
              actions.setActiveFile(null, "")
          }
          actions.updateOperationStatus(instruction.id, "completed")
        } else {
          throw new Error(result.error || "未知执行错误")
        }
      } catch (e: unknown) {
        const error = e instanceof Error ? e.message : String(e)
        actions.updateOperationStatus(instruction.id, "error")
        actions.setExecutionError(error)
        toast.error(`指令执行失败`, { description: error })

        this.instructionQueue = []
        break
      } finally {
        this.instructionQueue.shift()
      }
    }

    this.store.getState().actions.clearAllDevErrors()
    this.isProcessingQueue = false
    this.store.getState().actions.setIsProcessing(false)
    this.store
      .getState()
      .actions.setAiStatus("AI任务执行完毕，等待您的下一步指令。")
    this.store.getState().actions.setInstructionQueue([])
  }

  // ... (getInstructionDescription, _executeFileInstruction, 和 _saveOperationsToDb 方法保持不变) ...
  private getInstructionDescription(instruction: RenderNode): string {
    if (instruction.type === "file")
      return `${instruction.action} ${instruction.path}`
    if (instruction.type === "terminal") return instruction.command
    return "未知操作"
  }

  private async _executeFileInstruction(
    instruction: Extract<RenderNode, { type: "file" }>,
    projectId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.webcontainer) throw new Error("WebContainer not initialized")

    const { path, action, content } = instruction
    if (!path || !action)
      return { success: false, error: "指令无效: 缺少路径或操作" }

    try {
      const dbOperation: FileOperation = {
        type: action,
        path,
        content: action !== "delete" ? content : undefined,
      }

      switch (action) {
        case "create":
        case "update":
          const dir = path.substring(0, path.lastIndexOf("/"))
          if (dir) await this.webcontainer.fs.mkdir(dir, { recursive: true })
          await this.webcontainer.fs.writeFile(path, content)
          break
        case "delete":
          await this.webcontainer.fs.rm(path, { recursive: true })
          break
      }

      await this._saveOperationsToDb(projectId, [dbOperation])
      return { success: true }
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : String(e)
      console.error(`FileExecutor failed for ${action} on ${path}:`, error)
      return { success: false, error }
    }
  }

  private _runBackgroundTask(command: string, args: string[]) {
    if (!this.webcontainer || !this.terminal)
      throw new Error("环境未就绪，无法执行后台任务。")

    const fullCommand = `${command} ${args.join(" ")}`
    this.terminal.write(`\r\n\x1b[1;32m$ \x1b[0m${fullCommand}\r\n`)

    this.webcontainer.spawn(command, args).then((process) => {
      handleProcess(process, {
        terminal: this.terminal!,
        onSuccess: () => this.store.getState().actions.clearCompilationErrors(),
        errorCheck: {
          regex: /error|failed|exception|unhandled|could not be resolved/i,
          onDetection: (log) => this.store.getState().actions.addDevError(log),
        },
      }).then(({ exitCode }) => {
        this.terminal!.write(
          `\r\n\x1b[1;33m后台进程已退出，退出码: ${exitCode}\x1b[0m\r\n`
        )
      })
    })
  }

  private async _saveOperationsToDb(
    projectId: string,
    operations: FileOperation[]
  ) {
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
}