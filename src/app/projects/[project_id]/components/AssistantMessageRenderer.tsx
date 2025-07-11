"use client";

import React from "react";
import { useStreamParser } from "../hooks/useStreamParser";
import StructuredResponse from "./StructuredResponse";
import { OperationStatuses } from "@/types/ai";

interface AssistantMessageRendererProps {
  content: string;
  statuses: OperationStatuses;
  isLive: boolean;
  messageId: string;
}

const AssistantMessageRenderer = React.memo(function AssistantMessageRenderer({
  content,
  statuses,
  isLive,
  messageId,
}: AssistantMessageRendererProps) {
  const structuredResponse = useStreamParser(content, messageId);

  return (
    <StructuredResponse
      nodes={structuredResponse}
      statuses={statuses}
      isLive={isLive}
    />
  );
});

export default AssistantMessageRenderer;
