"use client"

import React from "react"
import { useStreamParser } from "../hooks/useStreamParser"
import StructuredResponse from "./StructuredResponse"
import { OperationStatuses } from "@/types/ai"

interface AssistantMessageRendererProps {
  content: string
  statuses: OperationStatuses
  isLive: boolean
  messageId: string
  onOpenFile: (path: string) => void
  isAnimating: boolean
}

const AssistantMessageRenderer = React.memo(function AssistantMessageRenderer({
  content,
  statuses,
  isLive,
  messageId,
  onOpenFile,
  isAnimating,
}: AssistantMessageRendererProps) {
  const structuredResponse = useStreamParser(content, messageId)

  return (
    <StructuredResponse
      nodes={structuredResponse}
      statuses={statuses}
      isLive={isLive}
      onOpenFile={onOpenFile}
      isAnimating={isAnimating}
    />
  )
})

export default AssistantMessageRenderer
