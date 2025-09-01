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

const STRUCTURAL_TAG_REGEX = /<(file|terminal)\s/

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
          const lastMdNode = getOrCreateLastMarkdownNode()
          // [+] START: 修正拼写错误和逻辑错误
          // 获取从当前光标到末尾的所有新内容
          const newContent = state.buffer.substring(state.cursor)
          if (newContent) {
            // 正确地追加新内容，而不是覆盖
            lastMdNode.content += newContent
          }
          // 将光标移动到末尾，因为所有剩余内容都已处理
          state.cursor = state.buffer.length
          // [+] END: 修正
          break main_loop
        }

        const absoluteTagStartIndex = state.cursor + tagStartIndex
        const markdownContent = state.buffer.substring(
          state.cursor,
          absoluteTagStartIndex
        )

        if (markdownContent) {
          getOrCreateLastMarkdownNode().content += markdownContent
        }

        state.cursor = absoluteTagStartIndex
        state.fsmState = ParserState.CAPTURING_TAG_DEFINITION
        break
      }

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
            getOrCreateLastMarkdownNode() // 确保在文件节点前有一个markdown节点容器
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
          tagDefinition.trim().endsWith("/")
        ) {
          const attrs = parseAttributes(tagDefinition)
          if (attrs.command) {
            getOrCreateLastMarkdownNode() // 确保在终端节点前有一个markdown节点容器
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

      case ParserState.CAPTURING_FILE_CONTENT: {
        const endFileTagIndex = unprocessedBuffer.indexOf("</file>")
        const nextStructuralTagMatch =
          unprocessedBuffer.match(STRUCTURAL_TAG_REGEX)
        const nextStructuralTagIndex = nextStructuralTagMatch?.index ?? -1

        if (
          nextStructuralTagIndex !== -1 &&
          (endFileTagIndex === -1 || nextStructuralTagIndex < endFileTagIndex)
        ) {
          const contentBeforeNewTag = unprocessedBuffer.substring(
            0,
            nextStructuralTagIndex
          )
          if (state.activeFileNode && contentBeforeNewTag) {
            state.activeFileNode.content += contentBeforeNewTag
          }

          if (state.activeFileNode) {
            state.activeFileNode.isClosed = true
            console.warn(
              `[Parser] Force-closing unclosed file tag for "${state.activeFileNode.path}" due to new structural tag starting.`
            )
          }
          state.activeFileNode = null

          state.cursor += nextStructuralTagIndex
          state.fsmState = ParserState.SEARCHING_FOR_TAG
          break
        }

        if (endFileTagIndex !== -1) {
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

        if (state.activeFileNode) {
          // 只追加新收到的内容
          const existingContentLength = state.activeFileNode.content.length
          const newContent = unprocessedBuffer.substring(existingContentLength)
          if (newContent) {
            state.activeFileNode.content += newContent
          }
          state.cursor = state.buffer.length
        }
        break main_loop
      }
    }
  }

  const finalNodes = state.nodes.filter(
    (node) => !(node.type === "markdown" && (node.content.trim() === "" || node.content.trim() === "/>"))
  )

  return finalNodes
}
