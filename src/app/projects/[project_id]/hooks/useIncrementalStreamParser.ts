"use client"

import { useRef } from "react"
import type { RenderNode, FileOperationType } from "@/types/ai"
import { simpleHash } from "../utils/parse"

enum ParserState {
  SEARCHING_FOR_TAG,
  CAPTURING_TAG_DEFINITION,
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
 * 增量流式解析器
 * 采用一个健壮的三状态 FSM 模型，能够精确处理跨数据块分割的结构化标签。
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

  // 如果是新消息，则重置状态机
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
  // 更新缓冲区为最新的完整内容
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
      // 状态1: 寻找下一个标签的开始 '<'
      case ParserState.SEARCHING_FOR_TAG: {
        const tagStartIndex = unprocessedBuffer.indexOf("<")

        // 如果找不到 '<'，则剩余所有内容都是 Markdown
        if (tagStartIndex === -1) {
          const lastMdNode = getOrCreateLastMarkdownNode()
          const newContent = state.buffer.substring(state.cursor)
          // 之前的逻辑会用最新的数据块覆盖之前的内容。
          // 现在，我们只追加游标之后的新内容。
          if (newContent) {
            lastMdNode.content += newContent
          }
          state.cursor = state.buffer.length
          break main_loop
        }

        const absoluteTagStartIndex = state.cursor + tagStartIndex
        const markdownContent = state.buffer.substring(
          state.cursor,
          absoluteTagStartIndex
        )

        if (markdownContent) {
          // 这是处理标签之间文本的关键修改。
          getOrCreateLastMarkdownNode().content += markdownContent
        }

        state.cursor = absoluteTagStartIndex
        state.fsmState = ParserState.CAPTURING_TAG_DEFINITION
        break
      }

      // 状态2: 已经找到了 '<'，现在寻找对应的 '>'
      case ParserState.CAPTURING_TAG_DEFINITION: {
        const tagEndIndex = unprocessedBuffer.indexOf(">")

        if (tagEndIndex === -1) {
          break main_loop
        }

        const absoluteTagEndIndex = state.cursor + tagEndIndex + 1
        const tagDefinition = state.buffer
          .substring(state.cursor + 1, absoluteTagEndIndex - 1)
          .trim()

        let tagProcessed = false

        if (
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
            state.fsmState = ParserState.SEARCHING_FOR_TAG
            tagProcessed = true
          }
        }

        if (!tagProcessed) {
          const unrecognizedTagText = state.buffer.substring(
            state.cursor,
            absoluteTagEndIndex
          )
          getOrCreateLastMarkdownNode().content += unrecognizedTagText
          state.fsmState = ParserState.SEARCHING_FOR_TAG
        }

        state.cursor = absoluteTagEndIndex
        break
      }

      // 状态3: 捕获 <file> 和 </file> 之间的内容
      case ParserState.CAPTURING_FILE_CONTENT: {
        const endFileTagIndex = unprocessedBuffer.indexOf("</file>")

        if (endFileTagIndex === -1) {
          if (state.activeFileNode) {
            const newContent = unprocessedBuffer
            // 这确保了在等待</file>闭合标签时，分块到达的文件内容可以被正确累加。
            if (newContent) {
              state.activeFileNode.content += newContent
            }
            // 移动游标以反映我们已经处理了这部分内容
            state.cursor = state.buffer.length
          }
          break main_loop
        }

        const absoluteEndFileTagIndex = state.cursor + endFileTagIndex
        const finalContentChunk = state.buffer.substring(
          state.cursor,
          absoluteEndFileTagIndex
        )

        if (state.activeFileNode) {
          if (finalContentChunk) {
            state.activeFileNode.content += finalContentChunk
          }
          state.activeFileNode.isClosed = true
          state.activeFileNode = null
        }

        state.cursor = absoluteEndFileTagIndex + "</file>".length
        state.fsmState = ParserState.SEARCHING_FOR_TAG
        break
      }
    }
  }
  const finalNodes = state.nodes.filter(
    (node) =>
      !(
        node.type === "markdown" &&
        (node.content.trim() === "" || node.content.trim() === "/>")
      )
  )

  return finalNodes
}
