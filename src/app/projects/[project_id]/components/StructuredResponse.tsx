"use client"

import React, { useState } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import OperationStatus from "./OperationStatus"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism"
import {
  FileOperationTypeText,
  OperationStatuses,
  OperationStatusType,
  RenderNode,
} from "@/types/ai"
import { cn } from "@/lib/utils"
import { ChevronDown, FileCode, TerminalSquare } from "lucide-react"

const FileOperationRenderer = ({
  node,
  status,
  onOpenFile,
}: {
  node: Extract<RenderNode, { type: "file" }>
  status: OperationStatusType
  onOpenFile: (path: string) => void
}) => {
  const [isExpanded, setIsExpanded] = useState(false)

  const lang = node.path ? node.path.split(".").pop() || "bash" : "bash"
  const displayPath = node.path || "[解析中...]"
  const displayAction = node.action
    ? FileOperationTypeText[node.action]
    : "文件操作"

  return (
    <details
      className='border border-neutral-700/80 rounded-md bg-neutral-900/30'
      onToggle={(e) => setIsExpanded((e.target as HTMLDetailsElement).open)}
    >
      <summary className='flex items-center gap-2 text-sm font-semibold text-left w-full p-2.5 transition-colors cursor-pointer hover:bg-neutral-700/50 list-none group'>
        <OperationStatus status={status} />
        <FileCode className='h-4 w-4 text-neutral-400 flex-shrink-0' />
        <span
          onClick={(e) => {
            e.preventDefault()
            if (node.path) {
              onOpenFile(node.path)
            }
          }}
          className={cn(
            "truncate flex-1 text-neutral-300",
            node.path && "hover:text-blue-400 hover:underline"
          )}
          title={
            node.path
              ? `点击在编辑器中打开 ${node.path}`
              : "正在等待文件路径..."
          }
        >
          {displayAction}文件:{" "}
          <strong className='font-bold text-neutral-100'>{displayPath}</strong>
        </span>
        <ChevronDown className='h-4 w-4 transition-transform group-open:rotate-180 flex-shrink-0' />
      </summary>

      {isExpanded && (
        <div className='border-t border-neutral-700/80 bg-black/20'>
          <SyntaxHighlighter
            language={lang}
            style={vscDarkPlus}
            customStyle={{
              margin: 0,
              borderRadius: "0 0 0.375rem 0.375rem",
              maxHeight: "400px",
              overflow: "auto",
            }}
            codeTagProps={{
              style: {
                fontSize: "0.8rem",
                fontFamily: "var(--font-geist-mono)",
              },
            }}
          >
            {node.content.trim()}
          </SyntaxHighlighter>
        </div>
      )}
    </details>
  )
}

export default function StructuredResponse({
  nodes,
  statuses,
  isLive,
  isAnimating,
  onOpenFile,
}: {
  nodes: RenderNode[]
  statuses: OperationStatuses
  isLive: boolean
  isAnimating: boolean
  onOpenFile: (path: string) => void
}) {
  return (
    <div className='flex gap-2 flex-col'>
      {nodes.map((node) => {
        let status: OperationStatusType

        if (!isLive && !isAnimating) {
          status = "completed"
        } else {
          status = statuses[node.id] || "pending"
        }

        switch (node.type) {
          case "markdown":
            if (!node.content.trim() && !isLive) {
              return null
            }
            return (
              <div
                key={node.id}
                className='prose prose-sm prose-invert max-w-full'
              >
                <Markdown remarkPlugins={[remarkGfm]}>{node.content}</Markdown>
              </div>
            )

          case "file":
            const isDelete = node.action === "delete"
            const displayAction = node.action
              ? FileOperationTypeText[node.action]
              : "文件操作"
            const displayPath = node.path || "[解析中...]"
            return (
              <div key={node.id} className='not-prose'>
                {isDelete ? (
                  <div
                    className={cn(
                      "flex items-center gap-2 text-sm font-semibold text-left w-full p-2.5 rounded-md",
                      "cursor-not-allowed text-neutral-400 bg-neutral-900/30 border border-neutral-700/80"
                    )}
                  >
                    <OperationStatus status={status} />
                    <span>
                      🗑️ {displayAction}文件:{" "}
                      <strong className='font-bold'>{displayPath}</strong>
                    </span>
                  </div>
                ) : (
                  <FileOperationRenderer
                    node={node}
                    status={status}
                    onOpenFile={onOpenFile}
                  />
                )}
              </div>
            )

          case "terminal":
            return (
              <div key={node.id} className='not-prose'>
                <div className='flex items-center gap-2 text-sm font-semibold text-left w-full p-2.5 rounded-md transition-colors bg-neutral-900/30 border border-neutral-700/80'>
                  <OperationStatus status={status} />
                  <TerminalSquare className='h-4 w-4 text-sky-400 flex-shrink-0' />
                  <span className='truncate flex-1 text-neutral-300'>
                    执行命令:
                    <code className='ml-2 text-sky-300 bg-sky-900/50 px-1.5 py-1 rounded text-xs'>
                      {node.command}
                    </code>
                  </span>
                </div>
              </div>
            )
          default:
            return null
        }
      })}
    </div>
  )
}
