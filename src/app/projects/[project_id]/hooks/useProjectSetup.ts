"use client"

interface UseProjectSetupProps {
  props: ProjectClientPageProps
  chatHook: UseChatHelpers
}

import { useEffect, useRef } from "react"
import { useMount } from "ahooks"
import { useWorkspaceStore } from "@/stores/WorkspaceStoreProvider"
import { useWebContainer } from "./useWebContainer"
import { convertInitialFilesToFileSystem } from "../utils/fileSystem"
import { type ProjectClientPageProps } from "@/types/ui"
import type { UseChatHelpers } from "@ai-sdk/react"
import { toast } from "sonner"

interface UseProjectSetupProps {
  props: ProjectClientPageProps
  chatHook: UseChatHelpers
}

export function useProjectSetup({ props, chatHook }: UseProjectSetupProps) {
  const { initialFiles, isFirstLoad, project } = props

  const webcontainer = useWorkspaceStore((state) => state.webcontainer)
  const terminal = useWorkspaceStore((state) => state.terminal)
  const actions = useWorkspaceStore((state) => state.actions)
  const initialAiCallFiredRef = useRef(false)

  const { initWebContainer, writeFile } = useWebContainer(project.id)
  const hasHydrated = useRef(false)
  const setupFlowHasRun = useRef(false)

  useMount(() => {
    if (isFirstLoad && !initialAiCallFiredRef.current) {
      initialAiCallFiredRef.current = true
      actions.setAiStatus("AI 正在思考...")
      actions.resetOperationStatuses()
      chatHook.reload()
    }

    const setupEnvironment = async () => {
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
        console.log("WebContainer and Terminal are ready.")
      }
    }

    setupEnvironment()
  })

  useEffect(() => {
    if (!webcontainer || !terminal || hasHydrated.current) return
    hasHydrated.current = true

    const hydrateAndSetup = async () => {
      if (initialFiles.length) {
        actions.setAiStatus("正在同步初始文件...")
      }
      const fileTree = convertInitialFilesToFileSystem(initialFiles)
      actions.setFileSystem(fileTree)

      if (initialFiles.length > 0) {
        await Promise.all(
          initialFiles.map((file) => writeFile(file.path, file.content))
        )
        // 默认打开第一个文件
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
          actions.setAiStatus("检测到 setup.sh，正在作为后台任务执行...")
          toast.info("正在执行启动脚本 setup.sh...")
          actions.runBackgroundTask("sh", ["setup.sh"])
          actions.setAiStatus("启动脚本正在后台运行。终端将显示其日志。")
        } else {
          actions.startInteractiveShell()
        }
      }
    }

    hydrateAndSetup()
  }, [webcontainer, terminal, initialFiles, writeFile, actions])
}
