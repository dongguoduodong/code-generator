import React from "react"
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
import { ChevronDown } from "lucide-react"
import { useTypewriter } from "../hooks/useTypewriter"

export const LiveMarkdownRenderer = ({ content }: { content: string }) => {
  const typedText = useTypewriter(content)

  return <Markdown remarkPlugins={[remarkGfm]}>{typedText}</Markdown>
}

interface StructuredResponseProps {
  nodes: RenderNode[]
  statuses: OperationStatuses
  isLive: boolean
  onOpenFile: (path: string) => void
}

export default function StructuredResponse({
  nodes,
  statuses,
  isLive,
  onOpenFile,
}: StructuredResponseProps) {
  return (
    <div>
      {nodes.map((node, index) => {
        let status: OperationStatusType

        if (!isLive) {
          status = "completed"
        } else {
          status = statuses[node.id] || "pending"
        }
        switch (node.type) {
          case "markdown":
            if (!node.content.trim()) {
              return null
            }
            const isLastNode = index === nodes.length - 1
            if (isLive && isLastNode) {
              return (
                <div
                  key={node.id}
                  className='prose prose-sm prose-invert max-w-full'
                >
                  <LiveMarkdownRenderer content={node.content} />
                </div>
              )
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
            const lang = node.path.split(".").pop() || "bash"
            return (
              <div key={node.id} className='my-4 not-prose'>
                {isDelete ? (
                  <div
                    className={cn(
                      "flex items-center gap-2 text-sm font-semibold text-left w-full p-2 rounded-md",
                      "cursor-not-allowed text-neutral-400"
                    )}
                  >
                    <OperationStatus status={status} />
                    <span className='truncate'>
                      🗑️{FileOperationTypeText[node.action]}文件:{" "}
                      <strong className='font-bold'>{node.path}</strong>
                    </span>
                  </div>
                ) : (
                  <details
                      className='border border-neutral-700/80 rounded-md'
                  >
                    <summary className='flex items-center gap-2 text-sm font-semibold text-left w-full p-2 rounded-md transition-colors cursor-pointer hover:bg-neutral-700/50 list-none group'>
                      <OperationStatus status={status} />
                      <span
                        onClick={(e) => {
                          e.preventDefault()
                          onOpenFile(node.path)
                        }}
                        className='truncate flex-1 text-neutral-300 hover:text-blue-400 hover:underline'
                        title={`点击在编辑器中打开 ${node.path}`}
                      >
                        {FileOperationTypeText[node.action]}文件:{" "}
                        <strong className='font-bold'>{node.path}</strong>
                      </span>
                      <ChevronDown className='h-4 w-4 transition-transform group-open:rotate-180' />
                    </summary>
                    <div className='border-t border-neutral-700/80'>
                      <SyntaxHighlighter
                        language={lang}
                        style={vscDarkPlus}
                        customStyle={{
                          margin: 0,
                          borderRadius: "0 0 0.375rem 0.375rem",
                          maxHeight: "300px",
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
                  </details>
                )}
              </div>
            )

          case "terminal":
            return (
              <div key={node.id} className='my-4 not-prose'>
                <div className='flex items-center gap-2 text-sm font-semibold mb-2'>
                  <OperationStatus status={status} />
                  <span>▶️ 执行命令:</span>
                </div>
                <SyntaxHighlighter
                  language='bash'
                  style={vscDarkPlus}
                  customStyle={{ margin: 0, borderRadius: "0.5rem" }}
                  codeTagProps={{
                    style: {
                      fontSize: "0.8rem",
                      fontFamily: "var(--font-geist-mono)",
                    },
                  }}
                >
                  {node.command}
                </SyntaxHighlighter>
              </div>
            )
          default:
            return null
        }
      })}
    </div>
  )
}
