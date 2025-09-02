"use client"

import React, { useLayoutEffect, useEffect, useRef, memo } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Bot, User, Send, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import AssistantMessageRenderer from "./AssistantMessageRenderer"
import { useWorkspaceStore } from "@/stores/WorkspaceStoreProvider"
import type { Project } from "@/types/database"
import { findLastIndex } from "lodash-es"
import { LoadingPlaceholder } from "./LoadingPlaceholder"
import { Message } from "ai"
import { UseChatHelpers } from "@ai-sdk/react"
import { RenderNode } from "@/types/ai"
import { useIncrementalStreamParser } from "../hooks/useIncrementalStreamParser"

const ChatMessage = memo(function ChatMessage({
  message,
  isLastAssistantMessage,
  lastMessageNodes,
  isLoading,
  isProcessingQueue,
  operationStatuses,
  onOpenFile,
  animatingMessageId,
}: {
  message: Message
  isLastAssistantMessage: boolean
  lastMessageNodes: RenderNode[]
  isPending: boolean
  isLoading: boolean
  isProcessingQueue: boolean
  operationStatuses: Record<
    string,
    "pending" | "executing" | "completed" | "error"
  >
  onOpenFile: (path: string) => void
  animatingMessageId: string | null
}) {
  const isLiveStreaming = isLoading && isLastAssistantMessage
  const isPostStreamProcessing = isLastAssistantMessage && isProcessingQueue
  const isEffectivelyLive = isLiveStreaming || isPostStreamProcessing


  // 对于内容不变的历史消息，此 Hook 由于内部有 useRef 缓存，开销不大。
  const parsedNodesForStaticMessage = useIncrementalStreamParser(
    message.id,
    message.content
  )

  const nodesForThisMessage = isLastAssistantMessage
    ? lastMessageNodes
    : parsedNodesForStaticMessage

  return (
    <div
      className={cn(
        "flex gap-3 items-start",
        message.role === "user" && "justify-end"
      )}
    >
      {message.role === "assistant" && (
        <div className='w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center flex-shrink-0'>
          <Bot size={18} />
        </div>
      )}
      <div
        className={cn(
          "p-3 rounded-lg prose prose-sm prose-invert overflow-x-auto",
          "max-w-9/10",
          message.role === "user" ? "bg-blue-600" : "bg-[#161b22] text-white"
        )}
      >
        {message.role === "assistant" ? (
          <>
            <AssistantMessageRenderer
              nodes={nodesForThisMessage}
              statuses={operationStatuses}
              isLive={isEffectivelyLive}
              onOpenFile={onOpenFile}
              isAnimating={message.id === animatingMessageId}
            />
          </>
        ) : (
          <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
        )}
      </div>
      {message.role === "user" && (
        <div className='w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0'>
          <User size={18} />
        </div>
      )}
    </div>
  )
})

export default function ChatPanel({
  messages,
  input,
  handleInputChange,
  status,
  onSubmit,
  project,
  onOpenFile,
  animatingMessageId,
  assistantMessageNodes,
  isAssistantMessagePending,
}: {
  messages: Message[]
  input: string
  handleInputChange: (
    e:
      | React.ChangeEvent<HTMLInputElement>
      | React.ChangeEvent<HTMLTextAreaElement>
  ) => void
  status: UseChatHelpers["status"]
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  project: Pick<Project, "name">
  onOpenFile: (path: string) => void
  animatingMessageId: string | null
  assistantMessageNodes: RenderNode[]
  isAssistantMessagePending: boolean
}) {
  const isLoading = status === "submitted" || status === "streaming"
  const isWaitingForResponse = status === "submitted"

  const aiStatus = useWorkspaceStore((state) => state.aiStatus)
  const { operationStatuses, isProcessing: isProcessingQueue } =
    useWorkspaceStore((state) => ({
      operationStatuses: state.operationStatuses,
      isProcessing: state.isProcessing,
    }))

  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)

  useLayoutEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    if (status === "submitted") {
      isAtBottomRef.current = true
    }

    if (isAtBottomRef.current) {
      container.scrollTop = container.scrollHeight
    }
  }, [messages, status])

  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    const handleScroll = () => {
      const scrollThreshold = 100
      const isScrolledToBottom =
        container.scrollHeight - container.scrollTop <=
        container.clientHeight + scrollThreshold
      isAtBottomRef.current = isScrolledToBottom
    }

    container.addEventListener("scroll", handleScroll, { passive: true })

    return () => {
      container.removeEventListener("scroll", handleScroll)
    }
  }, [])

  const lastAssistantMessageIndex = findLastIndex(
    messages,
    (m) => m.role === "assistant"
  )

  return (
    <aside className='w-full md:w-1/3 flex flex-col border-r border-neutral-800 h-screen bg-[#0d1117] text-neutral-300'>
      <header className='p-4 border-b border-neutral-800 shrink-0'>
        <h2 className='font-bold text-lg truncate'>
          {project.name} - AI Assistant
        </h2>
        <p className='text-xs font-mono animate-pulse h-4 truncate'>
          {isLoading || isProcessingQueue ? aiStatus : ""}
        </p>
      </header>

      <div
        className='flex-1 overflow-y-auto min-h-0 flex flex-col'
        ref={messagesContainerRef}
      >
        <div className='p-4 space-y-6'>
          {messages.map((m, index) => (
            <ChatMessage
              key={m.id}
              message={m}
              isLastAssistantMessage={
                m.role === "assistant" && index === lastAssistantMessageIndex
              }
              lastMessageNodes={assistantMessageNodes}
              isPending={isAssistantMessagePending}
              isLoading={isLoading}
              isProcessingQueue={isProcessingQueue}
              operationStatuses={operationStatuses}
              onOpenFile={onOpenFile}
              animatingMessageId={animatingMessageId}
            />
          ))}
          {isWaitingForResponse && <LoadingPlaceholder />}
        </div>
      </div>

      <footer className='p-4 border-t border-neutral-800 shrink-0'>
        <form onSubmit={onSubmit} className='flex gap-2'>
          <Input
            value={input}
            onChange={handleInputChange}
            placeholder='告诉AI您想做什么...'
            className='bg-neutral-700 border-neutral-600 focus:ring-blue-500'
          />
          <Button
            type='submit'
            disabled={isLoading || !input}
            size='icon'
            aria-label='Send Message'
          >
            {isLoading ? (
              <Loader2 className='h-4 w-4 animate-spin' />
            ) : (
              <Send size={16} />
            )}
          </Button>
        </form>
      </footer>
    </aside>
  )
}
