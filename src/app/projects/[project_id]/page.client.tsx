"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useChat } from "@ai-sdk/react"
import ignore from "ignore"
import { toast } from "sonner"
import { useMemoizedFn } from "ahooks"

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
import { ChatRequestOptions } from "ai"

/**
 * 项目工作区的核心客户端组件。
 * 负责协调 AI 聊天、WebContainer 环境、文件系统和 UI 组件之间的所有交互。
 */
export default function ProjectClientPage(props: ProjectClientPageProps) {
  const { project } = props

  const actions = useWorkspaceStore((state) => state.actions)
  const executionError = useWorkspaceStore((state) => state.executionError)
  const webcontainer = useWorkspaceStore((state) => state.webcontainer)
  const storeApi = useWorkspaceStoreApi()
  const {
    enqueueInstructions,
    setGitignoreParser,
    setExecutionError,
    setAiStatus,
    setPerformanceMetrics,
  } = actions

  const requestStartTime = useRef<number>(0)
  // 用于追踪当前正在进行流式动画的消息ID
  const [animatingMessageId, setAnimatingMessageId] = useState<string | null>(
    null
  )
  // 用于防止指令被重复执行的 ref
  const processedNodeIds = useRef(new Set<string>())

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
    // 在响应结束时，计算完整的响应时间
    onFinish: () => {
      const fullResponseTime = performance.now() - requestStartTime.current
      setPerformanceMetrics({ fullResponseTime })
      setAiStatus("AI 任务完成，等待您的下一步指令。")
    },
    onError: (err) => {
      toast.error("AI 对话时发生错误", { description: err.message })
      setAiStatus(`出现错误: ${err.message}`)
    },
  })

  const { messages, status } = chatHook

  useProjectSetup({ props, chatHook })

  const lastAssistantMessage = useMemo(
    () => messages.findLast((m) => m.role === "assistant"),
    [messages]
  )
  const latestParsedNodes = useIncrementalStreamParser(
    lastAssistantMessage?.id ?? "",
    lastAssistantMessage?.content ?? ""
  )
  const nodesJson = JSON.stringify(latestParsedNodes)

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
      setExecutionError(null) // 清除错误状态
    }
  }, [executionError, chatHook.append, setExecutionError])

  useEffect(() => {
    const isStreaming = status === "submitted" || status === "streaming"
    const lastMessage = messages[messages.length - 1]

    if (isStreaming && lastMessage?.role === "assistant") {
      setAnimatingMessageId(lastMessage.id)
    } else if (!isStreaming) {
      setAnimatingMessageId(null)
    }
  }, [messages, status])

  // 当解析出新的可执行指令时，将其加入执行队列
  useEffect(() => {
    const isStreaming = status === "submitted" || status === "streaming"
    if (isStreaming && lastAssistantMessage) {
      const newNodesToExecute = latestParsedNodes.filter((node: RenderNode) => {
        const isReadyForQueue =
          node.type === "terminal" || (node.type === "file" && node.isClosed)
        const isNew = !processedNodeIds.current.has(node.id)
        return isReadyForQueue && isNew
      })

      if (newNodesToExecute.length > 0) {
        newNodesToExecute.forEach((node) =>
          processedNodeIds.current.add(node.id)
        )
        enqueueInstructions(newNodesToExecute, project.id)
      }
    }
  }, [
    latestParsedNodes,
    status,
    enqueueInstructions,
    project.id,
    lastAssistantMessage,
  ])

  // 在组件卸载时执行清理操作
  useEffect(() => {
    return () => {
      // 获取最新的 store actions 和 webcontainer 实例
      const { resetWorkspace } = storeApi.getState().actions
      const wc = storeApi.getState().webcontainer
      if (wc) {
        console.log("正在卸载组件并销毁 WebContainer 实例...")
        resetWorkspace()
      }
    }
  }, [storeApi])

  const handleFormSubmit = useMemoizedFn(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      processedNodeIds.current.clear()
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

      // 在发送请求前，获取当前文件系统的快照
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

  // 处理来自 CodePanel 的开发服务器错误
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

  // 处理从聊天气泡中点击文件路径的事件
  const handleOpenFileFromChat = useMemoizedFn(async (path: string) => {
    const { webcontainer: wc, actions: storeActions } = storeApi.getState()
    if (!wc) {
      toast.error("开发容器尚未就绪，无法打开文件。")
      return
    }
    try {
      const content = await wc.fs.readFile(path, "utf-8")
      storeActions.setActiveFile(path, content)
      storeActions.setActiveWorkspaceTab("code") // 切换到代码视图
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
