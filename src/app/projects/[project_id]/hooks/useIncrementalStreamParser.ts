"use client"

import { useRef } from "react"
import type {
  RenderNode,
  FileOperationType,
  FileNode,
  TerminalNode,
  MarkdownNode,
} from "@/types/ai"
import { simpleHash } from "../utils/parse"

// 解析器是在指令块内部还是外部
enum TopLevelParserState {
  OUTSIDE_ARTIFACT,
  INSIDE_ARTIFACT,
}

enum ArtifactParserState {
  SEARCHING_TAG,
  CAPTURING_TAG_DEFINITION,
  CAPTURING_FILE_CONTENT,
}

interface ParserMachineState {
  topLevelState: TopLevelParserState
  artifactState: ArtifactParserState
  nodes: RenderNode[]
  buffer: string // 缓冲当前批次待处理的增量数据
  cursor: number // 缓冲内的游标
  currentMessageId: string | null
  activeFileNode: FileNode | null
  rawContentProcessedLength: number // 记录已处理的原始字符串长度
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
      topLevelState: TopLevelParserState.OUTSIDE_ARTIFACT,
      artifactState: ArtifactParserState.SEARCHING_TAG,
      nodes: [],
      buffer: "",
      cursor: 0,
      currentMessageId: messageId,
      activeFileNode: null,
      rawContentProcessedLength: 0,
    }
  }

  const state = stateRef.current
  const newChunk = rawContent.substring(state.rawContentProcessedLength)
  if (!newChunk) {
    return [...state.nodes]
  }

  // 将新块追加到内部 buffer
  state.buffer += newChunk

  const getOrCreateLastMarkdownNode = (): MarkdownNode => {
    const lastNode =
      state.nodes.length > 0 ? state.nodes[state.nodes.length - 1] : null
    if (lastNode?.type === "markdown") {
      return lastNode
    }
    const newMdNode: MarkdownNode = {
      id: `${messageId}-md-${state.nodes.length}-${Date.now()}`,
      type: "markdown",
      content: "",
    }
    state.nodes.push(newMdNode)
    return newMdNode
  }

  main_loop: while (state.cursor < state.buffer.length) {
    const remainingBuffer = state.buffer.substring(state.cursor)

    switch (state.topLevelState) {
      case TopLevelParserState.OUTSIDE_ARTIFACT: {
        const artifactStartIndex = remainingBuffer.indexOf("<code_artifact")

        if (artifactStartIndex === -1) {
          getOrCreateLastMarkdownNode().content += remainingBuffer
          state.cursor = state.buffer.length
          break main_loop
        }

        const markdownContentBeforeArtifact = remainingBuffer.substring(
          0,
          artifactStartIndex
        )
        if (markdownContentBeforeArtifact) {
          getOrCreateLastMarkdownNode().content += markdownContentBeforeArtifact
        }

        const tagEndIndex = remainingBuffer.indexOf(">", artifactStartIndex)
        if (tagEndIndex === -1) {
          // 标签不完整，将光标移动到标签头，以便保留它等待下一个数据块
          state.cursor += artifactStartIndex
          break main_loop
        }

        state.cursor += tagEndIndex + 1
        state.topLevelState = TopLevelParserState.INSIDE_ARTIFACT
        state.artifactState = ArtifactParserState.SEARCHING_TAG
        continue main_loop // 强制用新状态开始下一次迭代
      }

      case TopLevelParserState.INSIDE_ARTIFACT: {
        switch (state.artifactState) {
          case ArtifactParserState.SEARCHING_TAG: {
            const artifactEndIndex = remainingBuffer.indexOf("</code_artifact>")
            const nextSubTagStartIndex = remainingBuffer.indexOf("<")

            if (
              artifactEndIndex !== -1 &&
              (nextSubTagStartIndex === -1 ||
                artifactEndIndex < nextSubTagStartIndex)
            ) {
              if (state.activeFileNode) {
                const finalContentChunk = remainingBuffer.substring(
                  0,
                  artifactEndIndex
                )
                state.activeFileNode.content += finalContentChunk
                state.activeFileNode.isClosed = true
                state.activeFileNode = null
              }
              state.cursor += artifactEndIndex + "</code_artifact>".length
              state.topLevelState = TopLevelParserState.OUTSIDE_ARTIFACT
              continue main_loop // 强制用新状态开始下一次迭代
            }

            const tagStartIndex = remainingBuffer.indexOf("<")
            if (tagStartIndex === -1) {
              // 在 artifact 内部但找不到新标签，说明可能在文件内容中间，等待更多数据
              break main_loop
            }

            // 跳过标签之间的空白字符
            state.cursor += tagStartIndex
            state.artifactState = ArtifactParserState.CAPTURING_TAG_DEFINITION
            continue main_loop // 强制用新状态开始下一次迭代
          }

          case ArtifactParserState.CAPTURING_TAG_DEFINITION: {
            const tagEndIndex = remainingBuffer.indexOf(">")
            if (tagEndIndex === -1) {
              // 标签不完整，不移动cursor，等待更多数据
              break main_loop
            }

            const absoluteTagEndIndex = state.cursor + tagEndIndex + 1
            const tagDefinition = state.buffer
              .substring(state.cursor + 1, absoluteTagEndIndex - 1)
              .trim()

            if (
              tagDefinition.startsWith("file") &&
              !tagDefinition.startsWith("/file")
            ) {
              const attrs = parseAttributes(tagDefinition)
              if (attrs.path && attrs.action) {
                const fileNode: FileNode = {
                  id: `${messageId}-file-${simpleHash(attrs.path)}-${
                    state.nodes.length
                  }`,
                  type: "file",
                  path: attrs.path,
                  action: attrs.action as FileOperationType,
                  content: "",
                  isClosed: false,
                }
                state.nodes.push(fileNode)
                state.activeFileNode = fileNode
                state.artifactState = ArtifactParserState.CAPTURING_FILE_CONTENT
              } else {
                state.artifactState = ArtifactParserState.SEARCHING_TAG
              }
            } else if (
              tagDefinition.startsWith("terminal") &&
              tagDefinition.endsWith("/")
            ) {
              const attrs = parseAttributes(tagDefinition)
              if (attrs.command) {
                const terminalNode: TerminalNode = {
                  id: `${messageId}-terminal-${simpleHash(attrs.command)}-${
                    state.nodes.length
                  }`,
                  type: "terminal",
                  command: attrs.command,
                  background: attrs.bg === "true",
                }
                state.nodes.push(terminalNode)
                state.artifactState = ArtifactParserState.SEARCHING_TAG
              } else {
                state.artifactState = ArtifactParserState.SEARCHING_TAG
              }
            } else {
              state.artifactState = ArtifactParserState.SEARCHING_TAG
            }
            state.cursor = absoluteTagEndIndex
            continue main_loop // 强制用新状态开始下一次迭代
          }

          case ArtifactParserState.CAPTURING_FILE_CONTENT: {
            if (!state.activeFileNode) {
              state.artifactState = ArtifactParserState.SEARCHING_TAG
              continue main_loop
            }

            const endFileTag = "</file>"
            const endFileTagIndex = remainingBuffer.indexOf(endFileTag)

            if (endFileTagIndex !== -1) {
              const absoluteEndFileTagIndex = state.cursor + endFileTagIndex
              const finalContentChunk = state.buffer.substring(
                state.cursor,
                absoluteEndFileTagIndex
              )
              state.activeFileNode.content += finalContentChunk
              state.activeFileNode.isClosed = true
              state.activeFileNode = null

              state.cursor = absoluteEndFileTagIndex + endFileTag.length
              state.artifactState = ArtifactParserState.SEARCHING_TAG
              continue main_loop
            } else {
              // 未找到完整结束标签，将所有内容都当作文件内容，但需检查并保留可能的、不完整的结束标签
              let contentToAdd = remainingBuffer

              for (let i = endFileTag.length - 1; i > 0; i--) {
                const partialTag = endFileTag.substring(0, i)
                if (remainingBuffer.endsWith(partialTag)) {
                  contentToAdd = remainingBuffer.substring(
                    0,
                    remainingBuffer.length - partialTag.length
                  )
                  break
                }
              }

              state.activeFileNode.content += contentToAdd
              state.cursor += contentToAdd.length
              break main_loop
            }
          }
        }
        break
      }
    }
  }

  // 清理 buffer，只保留已处理数据之后的部分
  state.buffer = state.buffer.substring(state.cursor)
  // 因为 buffer 的开头已经是未处理部分，所以 cursor 重置为 0
  state.cursor = 0
  // 更新已处理的总长度
  state.rawContentProcessedLength = rawContent.length

  return [...state.nodes]
}
