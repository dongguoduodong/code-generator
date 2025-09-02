"use client"

import React from "react"
import StructuredResponse from "./StructuredResponse"
import { OperationStatuses, RenderNode } from "@/types/ai" // 💡 引入 RenderNode 类型

interface AssistantMessageRendererProps {
  nodes: RenderNode[]

  statuses: OperationStatuses
  isLive: boolean
  onOpenFile: (path: string) => void
  isAnimating: boolean
}

const AssistantMessageRenderer = React.memo(function AssistantMessageRenderer({
  nodes,
  statuses,
  isLive,
  onOpenFile,
  isAnimating,
}: AssistantMessageRendererProps) {
  return (
    <StructuredResponse
      nodes={nodes}
      statuses={statuses}
      isLive={isLive}
      onOpenFile={onOpenFile}
      isAnimating={isAnimating}
    />
  )
})

export default AssistantMessageRenderer
