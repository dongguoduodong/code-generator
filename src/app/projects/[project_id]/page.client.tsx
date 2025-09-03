"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useChat } from "@ai-sdk/react"
import ignore from "ignore"
import { toast } from "sonner"
import { useMemoizedFn } from "ahooks"
import { ChatRequestOptions } from "ai"

import { type ProjectClientPageProps } from "@/types/ui"
import { type RenderNode } from "@/types/ai"
import { useProjectSetup } from "./hooks/useProjectSetup"
import { useIncrementalStreamParser } from "./hooks/useIncrementalStreamParser"
import { filterAndSnapshotFileSystem } from "./utils/fileSystem"
import ChatPanel from "./components/ChatPanel"
import WorkspacePanel from "./components/WorkspacePanel"
import {
  useWorkspaceStore,
  useWorkspaceStoreApi,
} from "@/stores/WorkspaceStoreProvider"
import { WorkspaceService } from "@/services/WorkspaceService"

export default function ProjectClientPage(props: ProjectClientPageProps) {
  const { project } = props

  const storeApi = useWorkspaceStoreApi()
  const { actions, executionError, webcontainer } = useWorkspaceStore(
    (state) => ({
      actions: state.actions,
      executionError: state.executionError,
      webcontainer: state.webcontainer,
      terminal: state.terminal,
    })
  )
  const {
    setGitignoreParser,
    setExecutionError,
    setAiStatus,
    setPerformanceMetrics,
  } = actions

  const [workspaceService] = useState(() => new WorkspaceService(storeApi))

  const requestStartTime = useRef<number>(0)
  const [animatingMessageId, setAnimatingMessageId] = useState<string | null>(
    null
  )

  const processedNodeIds = useRef(new Map<string, Set<string>>())

  const [isPending, startTransition] = useTransition()
  const [displayedNodes, setDisplayedNodes] = useState<RenderNode[]>([])

  const chatHook = useChat({
    api: `/api/projects/${props.project.id}/chat`,
    initialMessages: props.initialMessages,
    body: {
      projectId: props.project.id,
    },
    fetch: (input, init) => {
      requestStartTime.current = performance.now()
      setPerformanceMetrics({
        timeToFirstToken: null,
        fullResponseTime: null,
        routerDecisionTime: null,
        preJudgmentTime: null,
      })
      return fetch(input, init)
    },
    onResponse: (response) => {
      const timeToFirstToken = performance.now() - requestStartTime.current
      const routerTime = response.headers.get("X-Performance-Router-Time")
      const prejudgmentTime = response.headers.get(
        "X-Performance-Prejudgment-Time"
      )
      setPerformanceMetrics({
        timeToFirstToken,
        routerDecisionTime: routerTime ? parseFloat(routerTime) : null,
        preJudgmentTime: prejudgmentTime ? parseFloat(prejudgmentTime) : null,
      })
    },
    onFinish: () => {
      const fullResponseTime = performance.now() - requestStartTime.current
      setPerformanceMetrics({ fullResponseTime })
    },
    onError: (err) => {
      toast.error("AI 对话时发生错误", { description: err.message })
      setAiStatus(`出现错误: ${err.message}`)
    },
  })

  const { messages, status } = chatHook

  useProjectSetup({ props, chatHook, workspaceService })

  const lastAssistantMessage = useMemo(
    () => messages.findLast((m) => m.role === "assistant"),
    [messages]
  )
  const latestParsedNodes = useIncrementalStreamParser(
    lastAssistantMessage?.id ?? "",
    lastAssistantMessage?.content ?? ""
  )
  const nodesJson = useMemo(
    () => JSON.stringify(latestParsedNodes),
    [latestParsedNodes]
  )
  console.log("latestParsedNodes", latestParsedNodes)

  useEffect(() => {
    startTransition(() => {
      setDisplayedNodes(latestParsedNodes)
    })
  }, [nodesJson])

  const gitignoreParser = useMemo(() => {
    const ig = ignore()
    if (props.initialGitignoreContent) {
      ig.add(props.initialGitignoreContent)
    }
    ig.add([".git/", "node_modules", "dist"])
    return ig
  }, [props.initialGitignoreContent])

  useEffect(() => {
    setGitignoreParser(gitignoreParser)
  }, [gitignoreParser, setGitignoreParser])

  useEffect(() => {
    if (executionError) {
      chatHook.append({
        role: "user",
        content: `[SYSTEM_ERROR] An error occurred while executing the previous instructions. Please analyze the error and create a new plan to fix it.\n\nError details:\n${executionError}`,
      })
      setExecutionError(null)
    }
  }, [executionError, chatHook, setExecutionError])

  useEffect(() => {
    const isStreaming = status === "submitted" || status === "streaming"
    const lastMessage = messages[messages.length - 1]

    if (isStreaming && lastMessage?.role === "assistant") {
      setAnimatingMessageId(lastMessage.id)
    } else if (!isStreaming) {
      setAnimatingMessageId(null)
    }
  }, [messages, status])

  useEffect(() => {
    const isStreaming = status === "submitted" || status === "streaming"
    if (
      isStreaming &&
      lastAssistantMessage?.id &&
      lastAssistantMessage?.role === "assistant"
    ) {
      const currentMessageId = lastAssistantMessage.id

      // 为当前消息获取或创建一个专用的 Set
      if (!processedNodeIds.current.has(currentMessageId)) {
        processedNodeIds.current.set(currentMessageId, new Set<string>())
      }
      const currentMessageProcessedSet =
        processedNodeIds.current.get(currentMessageId)!

      const newNodesToExecute = latestParsedNodes.filter((node: RenderNode) => {
        const isReadyForQueue =
          node.type === "terminal" || (node.type === "file" && node.isClosed)
        // 检查是否在该消息专属的 Set 中已存在
        const isNew = !currentMessageProcessedSet.has(node.id)
        return isReadyForQueue && isNew
      })

      if (newNodesToExecute.length > 0) {
        newNodesToExecute.forEach((node) =>
          // 将新执行的 node ID 添加到该消息专属的 Set 中
          currentMessageProcessedSet.add(node.id)
        )
        workspaceService.enqueueInstructions(newNodesToExecute, project.id)
      }
    }
  }, [
    latestParsedNodes,
    status,
    workspaceService,
    project.id,
    lastAssistantMessage,
  ])

  useEffect(() => {
    const handleBeforeUnload = () => {
      const { resetWorkspace } = storeApi.getState().actions
      const wc = storeApi.getState().webcontainer
      if (wc) {
        console.log("页面即将卸载，销毁 WebContainer 实例...")
        resetWorkspace()
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [storeApi]) // 依赖 storeApi 确保函数引用稳定

  const handleFormSubmit = useMemoizedFn(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      setAiStatus("AI 正在思考中...")
      const trimmedInput = chatHook.input.trim()

      if (!trimmedInput) {
        setAiStatus("AI 已准备就绪。")
        return
      }

      chatHook.setInput(trimmedInput)
      if (!webcontainer) {
        toast.error("开发容器尚未就绪，请稍候。")
        setAiStatus("错误：开发容器不可用。")
        return
      }

      const snapshot = await filterAndSnapshotFileSystem(
        webcontainer,
        gitignoreParser
      )

      const chatRequestOptions: ChatRequestOptions = {
        body: {
          fileSystemSnapshot: snapshot,
        },
      }

      chatHook.handleSubmit(e, chatRequestOptions)
    }
  )

  const handleFixDevError = useMemoizedFn(async (errorLog: string) => {
    if (!webcontainer) {
      toast.error("无法提交修复请求：环境尚未完全就绪。")
      return
    }
    setAiStatus("正在准备错误报告以提交给 AI...")

    const feedbackToAI = `[SYSTEM_ERROR] The development server reported an error. Please analyze the error log and the project files to create a plan to fix it.\n\nError Log:\n${errorLog}`
    const snapshot = await filterAndSnapshotFileSystem(
      webcontainer,
      gitignoreParser
    )

    chatHook.append(
      { role: "user", content: feedbackToAI },
      { body: { fileSystemSnapshot: snapshot } }
    )
  })

  const handleOpenFileFromChat = useMemoizedFn(async (path: string) => {
    const { webcontainer: wc, actions: storeActions } = storeApi.getState()
    if (!wc) {
      toast.error("开发容器尚未就绪，无法打开文件。")
      return
    }
    try {
      const content = await wc.fs.readFile(path, "utf-8")
      storeActions.setActiveFile(path, content)
      storeActions.setActiveWorkspaceTab("code")
    } catch (error) {
      console.error(`从聊天中打开文件 ${path} 失败:`, error)
      toast.error("打开文件失败", {
        description: `文件 "${path}" 不存在或已被删除。`,
      })
    }
  })

  return (
    <div className='flex h-screen bg-[#0d1117] text-neutral-300 font-sans'>
      <ChatPanel
        messages={chatHook.messages}
        input={chatHook.input}
        handleInputChange={chatHook.handleInputChange}
        status={chatHook.status}
        onSubmit={handleFormSubmit}
        project={props.project}
        onOpenFile={handleOpenFileFromChat}
        animatingMessageId={animatingMessageId}
        assistantMessageNodes={displayedNodes}
        isAssistantMessagePending={isPending}
      />
      <WorkspacePanel onFixDevError={handleFixDevError} />
    </div>
  )
}