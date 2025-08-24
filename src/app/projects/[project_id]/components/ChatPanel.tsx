"use client"

import React, { useEffect, useRef } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Bot, User, Send, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import AssistantMessageRenderer from "./AssistantMessageRenderer"
import { useWorkspaceStore } from "@/stores/WorkspaceStoreProvider"
import type { UseChatHelpers } from "@ai-sdk/react"
import type { Project } from "@/types/database"
import { findLastIndex } from "lodash-es"

interface ChatPanelProps {
  chatHook: UseChatHelpers
  project: Pick<Project, "name">
  onOpenFile: (path: string) => void
}

export default function ChatPanel({
  chatHook,
  project,
  onOpenFile,
}: ChatPanelProps) {
  const { messages, input, handleInputChange, handleSubmit, status } = chatHook
  const isLoading = status === "submitted" || status === "streaming"

  const aiStatus = useWorkspaceStore((state) => state.aiStatus)
  const { operationStatuses, isProcessing: isProcessingQueue } =
    useWorkspaceStore((state) => ({
      operationStatuses: state.operationStatuses,
      isProcessing: state.isProcessing,
    }))
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight
    }
  }, [messages])

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    handleSubmit(e)
  }

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
        <p className='text-xs text-yellow-400 font-mono animate-pulse h-4 truncate'>
          {isLoading ? aiStatus : ""}
        </p>
      </header>
      <div
        className='flex-1 overflow-y-auto min-h-0'
        ref={messagesContainerRef}
      >
        <div className='p-4 space-y-6'>
          {messages.map((m, index) => {
            const messageKey = "id" in m && m.id ? m.id : `message-${index}`
            const isLastAssistantMessage =
              m.role === "assistant" && index === lastAssistantMessageIndex
            // 判断是否是数组中的绝对最后一条消息
            const isLastMessageInArray = index === messages.length - 1

            const isLiveStreaming = isLoading && isLastMessageInArray

            // 条件 b: 流式传输已结束，但后台指令仍在执行
            const isPostStreamProcessing =
              isLastAssistantMessage && isProcessingQueue

            const isEffectivelyLive = isLiveStreaming || isPostStreamProcessing
            return (
              <div
                key={messageKey}
                className={cn(
                  "flex gap-3 items-start",
                  m.role === "user" && "justify-end"
                )}
              >
                {m.role === "assistant" && (
                  <div className='w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center flex-shrink-0'>
                    <Bot size={18} />
                  </div>
                )}
                <div
                  className={cn(
                    "p-3 rounded-lg max-w-sm prose prose-sm prose-invert w-max-full",
                    m.role === "user"
                      ? "bg-blue-600"
                      : "bg-[#161b22] text-white"
                  )}
                >
                  {m.role === "assistant" ? (
                    <AssistantMessageRenderer
                      messageId={m.id}
                      content={m.content}
                      statuses={operationStatuses}
                      isLive={isEffectivelyLive}
                      onOpenFile={onOpenFile}
                    />
                  ) : (
                    <Markdown remarkPlugins={[remarkGfm]}>{m.content}</Markdown>
                  )}
                </div>
                {m.role === "user" && (
                  <div className='w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0'>
                    <User size={18} />
                  </div>
                )}
              </div>
            )
          })}
          {isLoading &&
            messages.length > 0 &&
            messages[messages.length - 1]?.role === "user" && (
              <div className='flex items-start gap-3'>
                <div className='w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center flex-shrink-0'>
                  <Bot size={18} />
                </div>
                <div className='p-3 rounded-lg bg-[#161b22] flex items-center'>
                  <Loader2 className='w-5 h-5 animate-spin text-neutral-400' />
                </div>
              </div>
            )}
        </div>
      </div>
      <footer className='p-4 border-t border-neutral-800 shrink-0'>
        <form onSubmit={handleFormSubmit} className='flex gap-2'>
          <Input
            value={input}
            onChange={handleInputChange}
            placeholder='告诉AI您想做什么...'
            className='bg-neutral-700 border-neutral-600 focus:ring-blue-500'
            disabled={isLoading}
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
