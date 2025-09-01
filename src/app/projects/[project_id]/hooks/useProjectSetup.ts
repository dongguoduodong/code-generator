"use client"

import { useEffect, useRef } from "react"
import { useMount } from "ahooks"
import { toast } from "sonner"
import type { UseChatHelpers } from "@ai-sdk/react"

import {
  useWorkspaceStore,
  useWorkspaceStoreApi,
} from "@/stores/WorkspaceStoreProvider"
import { useWebContainer } from "./useWebContainer"
import { convertInitialFilesToFileSystem } from "../utils/fileSystem"
import { type ProjectClientPageProps } from "@/types/ui"

interface UseProjectSetupProps {
  props: ProjectClientPageProps
  chatHook: UseChatHelpers
}

/**
 * 负责在项目页面加载时进行所有必要的异步设置。
 * - 初始化 WebContainer 和 Terminal。
 * - 对于新项目，触发初始的 AI 对话。
 * - 将数据库中的文件“水合”到 WebContainer 的虚拟文件系统中。
 * - 自动执行项目的启动脚本 (setup.sh)。
 */
export function useProjectSetup({ props, chatHook }: UseProjectSetupProps) {
  const { initialFiles, isFirstLoad, project } = props

  const actions = useWorkspaceStore((state) => state.actions)
  const initialAiCallFiredRef = useRef(false)
  const setupFlowHasRun = useRef(false)

  const storeApi = useWorkspaceStoreApi()
  const { initWebContainer, writeFile } = useWebContainer(project.id)

  useMount(() => {
    if (isFirstLoad && !initialAiCallFiredRef.current) {
      initialAiCallFiredRef.current = true
      actions.setAiStatus("AI 正在思考...")
      actions.resetOperationStatuses()
      chatHook.reload()
    }

    const setupEnvironment = async () => {
      const { webcontainer: existingWc, actions: storeActions } =
        storeApi.getState()
      if (existingWc) {
        console.warn("检测到残留的 WebContainer 实例。在继续之前将强制销毁。")
        await existingWc.teardown()
        storeActions.resetWorkspace()
      }

      const webcontainerInstance = await initWebContainer()

      if (webcontainerInstance) {
        const { Terminal } = await import("xterm")
        const term = new Terminal({
          convertEol: true,
          cursorBlink: true,
          theme: { background: "#0D1117", foreground: "#e0e0e0" },
          rows: 15,
          fontSize: 13,
          fontFamily: "var(--font-geist-mono), monospace",
          lineHeight: 1.4,
        })

        actions.setWebcontainer(webcontainerInstance, project.id)
        actions.setTerminal(term)
        console.log("WebContainer 和 Terminal 已准备就绪。")
      }
    }

    setupEnvironment()
  })

  const webcontainer = useWorkspaceStore((state) => state.webcontainer)
  const terminal = useWorkspaceStore((state) => state.terminal)
  const hasHydrated = useRef(false)

  useEffect(() => {
    // 确保这个 effect 只在 webcontainer 和 terminal 都存在且尚未水合时运行
    if (!webcontainer || !terminal || hasHydrated.current) return
    hasHydrated.current = true

    const hydrateAndSetup = async () => {
      if (initialFiles.length > 0) {
        actions.setAiStatus("正在同步初始文件...")
        toast.info("正在将项目文件加载到虚拟环境中...")
      }

      const fileTree = convertInitialFilesToFileSystem(initialFiles)
      actions.setFileSystem(fileTree)

      // 将文件并行写入 WebContainer 的虚拟文件系统
      if (initialFiles.length > 0) {
        await Promise.all(
          initialFiles.map((file) => writeFile(file.path, file.content))
        )

        const firstFile =
          initialFiles.find((f) => !f.path.includes("/")) || initialFiles[0]
        if (firstFile) {
          actions.setActiveFile(firstFile.path, firstFile.content)
        }
      }

      if (!setupFlowHasRun.current) {
        setupFlowHasRun.current = true
        const setupShExists = initialFiles.some((f) => f.path === "setup.sh")

        if (setupShExists) {
          // 如果存在 setup.sh，则作为后台任务执行
          actions.setAiStatus("检测到 setup.sh，正在作为后台任务执行...")
          toast.info("正在执行启动脚本 setup.sh...")
          actions.runBackgroundTask("sh", ["setup.sh"])
          actions.setAiStatus("启动脚本正在后台运行。终端将显示其日志。")
        } else {
          // 如果没有，则启动一个交互式 shell
          actions.startInteractiveShell()
        }
      }
    }

    hydrateAndSetup()
  }, [webcontainer, terminal, initialFiles, writeFile, actions])
}
