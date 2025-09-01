"use client"

import { useRef } from "react"
import type { RenderNode, FileOperationType } from "@/types/ai"
import { simpleHash } from "../utils/parse"

enum ParserState {
  SEARCHING_FOR_TAG,
  CAPTURING_FILE_CONTENT,
}

interface ParserMachineState {
  fsmState: ParserState
  nodes: RenderNode[]
  buffer: string
  cursor: number
  currentMessageId: string | null
  activeFileNode: Extract<RenderNode, { type: "file" }> | null
}

const parseAttributes = (tagContent: string): Record<string, string> => {
  const attributes: Record<string, string> = {}
  const attrRegex = /(\w+)=["'](.*?)["']/g
  let match
  while ((match = attrRegex.exec(tagContent)) !== null) {
    attributes[match[1]] = match[2]
  }
  return attributes
}

/**
 * 增量流式解析器。
 * 采用精确的 FSM 模型，能够正确区分结构标签和文件内容，并安全处理包装标签。
 *
 * @param messageId 正在处理的消息的唯一ID。
 * @param rawContent 到目前为止收到的完整原始消息流内容。
 * @returns RenderNode 对象数组。
 */
export function useIncrementalStreamParser(
  messageId: string,
  rawContent: string
): RenderNode[] {
  const stateRef = useRef<ParserMachineState | null>(null)

  if (
    stateRef.current === null ||
    messageId !== stateRef.current.currentMessageId
  ) {
    stateRef.current = {
      fsmState: ParserState.SEARCHING_FOR_TAG,
      nodes: [],
      buffer: "",
      cursor: 0,
      currentMessageId: messageId,
      activeFileNode: null,
    }
  }

  const state = stateRef.current
  state.buffer = rawContent

  const getOrCreateLastMarkdownNode = (): Extract<
    RenderNode,
    { type: "markdown" }
  > => {
    const lastNode =
      state.nodes.length > 0 ? state.nodes[state.nodes.length - 1] : null
    if (lastNode && lastNode.type === "markdown") {
      return lastNode
    }
    const newMdNode: Extract<RenderNode, { type: "markdown" }> = {
      id: `${messageId}-md-${state.nodes.length}`,
      type: "markdown",
      content: "",
    }
    state.nodes.push(newMdNode)
    return newMdNode
  }

  main_loop: while (state.cursor < state.buffer.length) {
    const unprocessedBuffer = state.buffer.substring(state.cursor)

    switch (state.fsmState) {
      case ParserState.SEARCHING_FOR_TAG: {
        const tagStartIndex = unprocessedBuffer.indexOf("<")

        if (tagStartIndex === -1) {
          getOrCreateLastMarkdownNode().content = unprocessedBuffer
          break main_loop
        }

        const absoluteTagStartIndex = state.cursor + tagStartIndex
        const markdownContent = state.buffer.substring(
          state.cursor,
          absoluteTagStartIndex
        )

        if (markdownContent) {
          getOrCreateLastMarkdownNode().content = markdownContent
        }

        state.cursor = absoluteTagStartIndex
        const tagEndIndex = unprocessedBuffer.indexOf(">", tagStartIndex)

        if (tagEndIndex === -1) {
          break main_loop
        }

        const absoluteTagEndIndex = state.cursor + tagEndIndex + 1
        const tagDefinition = state.buffer
          .substring(state.cursor + 1, absoluteTagEndIndex - 1)
          .trim()

        let tagProcessed = false

        // 安全地处理包装标签
        if (tagDefinition === "" || tagDefinition === "/") {
          tagProcessed = true
        } else if (
          tagDefinition.startsWith("file") &&
          !tagDefinition.startsWith("/file")
        ) {
          const attrs = parseAttributes(tagDefinition)
          if (attrs.path && attrs.action) {
            const fileNode: Extract<RenderNode, { type: "file" }> = {
              id: `${messageId}-file-${attrs.action}-${attrs.path}`,
              type: "file",
              path: attrs.path,
              action: attrs.action as FileOperationType,
              content: "",
              isClosed: false,
            }
            state.nodes.push(fileNode)
            state.activeFileNode = fileNode
            state.fsmState = ParserState.CAPTURING_FILE_CONTENT
            tagProcessed = true
          }
        } else if (
          tagDefinition.startsWith("terminal") &&
          tagDefinition.endsWith("/")
        ) {
          const attrs = parseAttributes(tagDefinition)
          if (attrs.command) {
            const terminalNode: Extract<RenderNode, { type: "terminal" }> = {
              id: `${messageId}-terminal-${simpleHash(attrs.command)}`,
              type: "terminal",
              command: attrs.command,
              background: attrs.bg === "true",
            }
            state.nodes.push(terminalNode)
            tagProcessed = true
          }
        }

        if (tagProcessed) {
          state.cursor = absoluteTagEndIndex
        } else {
          getOrCreateLastMarkdownNode().content += "<"
          state.cursor++
        }
        break
      }

      case ParserState.CAPTURING_FILE_CONTENT: {
        const endFileTagIndex = unprocessedBuffer.indexOf("</file>")

        if (endFileTagIndex === -1) {
          if (state.activeFileNode) {
            // 将所有未处理的内容都视为文件内容，无论其中包含什么
            state.activeFileNode.content = unprocessedBuffer
          }
          // 等待更多数据以找到 </file>
          break main_loop
        }

        const absoluteEndFileTagIndex = state.cursor + endFileTagIndex
        const fileContent = state.buffer.substring(
          state.cursor,
          absoluteEndFileTagIndex
        )

        if (state.activeFileNode) {
          state.activeFileNode.content = fileContent
          state.activeFileNode.isClosed = true
          state.activeFileNode = null
        }

        state.cursor = absoluteEndFileTagIndex + "</file>".length
        state.fsmState = ParserState.SEARCHING_FOR_TAG
        break
      }
    }
  }

  // 返回前进行最后清理，移除可能产生的空 Markdown 节点
  const finalNodes = state.nodes.filter(
    (node) =>
      !(
        node.type === "markdown" &&
        (node.content.trim() === "" || node.content === "/>")
      )
  )

  return finalNodes
}
