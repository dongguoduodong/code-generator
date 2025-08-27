import { FileOperationType, RenderNode } from "@/types/ai"
import { useMemo } from "react"
import { simpleHash } from "../utils/parse"

export function useStreamParser(
  rawContent: string,
  messageId: string
): RenderNode[] {
  const structuredResponse = useMemo(() => {
    if (!rawContent) return []
    let content = rawContent.trim() 

    if (content.startsWith("<>") && content.endsWith("</>")) {
      content = content.slice(2, -3).trim()
    } else if (content.startsWith("<>")) {
      content = content.substring(2).trim()
    } else if (content.endsWith("</>")) {
      content = content.slice(0, -3).trim()
    }


    const prefix = messageId

    // 移除可能存在的 ```xml ... ``` markdown 包装
    const codeBlockMatch = content.match(/^```xml\n([\s\S]*)\n```$/)
    if (codeBlockMatch) {
      content = codeBlockMatch[1]
    }

    const nodes: RenderNode[] = []
    const tagStartRegex = /<(file|terminal)/g
    let lastIndex = 0
    let match

    while ((match = tagStartRegex.exec(content)) !== null) {
      const textBeforeTag = content.substring(lastIndex, match.index)
      if (textBeforeTag.trim()) {
        nodes.push({
          id: `${prefix}-md-${nodes.length}`,
          type: "markdown",
          content: textBeforeTag,
        })
      }

      const tagContent = content.substring(match.index)

      if (match[1] === "file") {
        const pathMatch = tagContent.match(/path=(['"])(.*?)\1/)
        const actionMatch = tagContent.match(/action=(['"])(.*?)\1/)

        if (pathMatch && actionMatch) {
          const path = pathMatch[2]
          const action = actionMatch[2] as FileOperationType
          const selfClosingMatch = tagContent.match(/^<file.*?\/>/)
          const closingTagMatch = tagContent.match(/<\/file>/)

          let fileBody = ""
          let isClosed = false
          let tagEndIndex = -1

          if (selfClosingMatch) {
            isClosed = true
            tagEndIndex = match.index + selfClosingMatch[0].length
          } else if (closingTagMatch) {
            isClosed = true
            const bodyMatch = tagContent.match(/>([\s\S]*?)<\/file>/)
            if (bodyMatch) fileBody = bodyMatch[1]
            tagEndIndex = match.index + tagContent.indexOf("</file>") + 7
          }

          if (tagEndIndex !== -1) {
            nodes.push({
              id: `${prefix}-file-${action}-${path}`,
              type: "file",
              path,
              action,
              content: fileBody,
              isClosed,
            })
            lastIndex = tagEndIndex
          } else {
            lastIndex = content.length
          }
        } else {
          lastIndex = content.length
        }
      }
      else if (match[1] === "terminal") {
        const commandMatch = tagContent.match(/command=(['"])(.*?)\1/)
        const selfClosingMatch = tagContent.match(/^<terminal.*?\/>/)

        if (commandMatch && selfClosingMatch) {
          const backgroundMatch = tagContent.match(/bg=(['"])true\1/)
          nodes.push({
            id: `${prefix}-terminal-${simpleHash(commandMatch[2])}`,
            type: "terminal",
            command: commandMatch[2],
            background: !!backgroundMatch,
          })
          lastIndex = match.index + selfClosingMatch[0].length
        } else {
          lastIndex = content.length
        }
      }
    }

    const remainingText = content.substring(lastIndex)
    if (remainingText) {
      const lastNode = nodes.length > 0 ? nodes[nodes.length - 1] : null

      // 如果最后一个节点是Markdown，说明剩余文本是该节点内容的延续
      if (lastNode && lastNode.type === "markdown") {
        lastNode.content += remainingText
      } else {
        // 否则，这是一个新的Markdown节点
        nodes.push({
          id: `${prefix}-md-final-${nodes.length}`,
          type: "markdown",
          content: remainingText,
        })
      }
    }

    return nodes
  }, [rawContent, messageId])

  return structuredResponse
}
