import React from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import OperationStatus from "./OperationStatus";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  FileOperationTypeText,
  OperationStatuses,
  OperationStatusType,
  RenderNode,
} from "@/types/ai";

interface StructuredResponseProps {
  nodes: RenderNode[];
  statuses: OperationStatuses;
  isLive: boolean;
}

export default function StructuredResponse({
  nodes,
  statuses,
  isLive,
}: StructuredResponseProps) {
  return (
    <div>
      {nodes.map((node) => {
        let status: OperationStatusType;

        if (!isLive) {
          // 1. 如果是历史消息，状态永远是 "completed"
          status = "completed";
        } else {
          // 2. 如果是实时消息，从 store 中查找状态，
          //    如果还未找到（说明刚解析出来），则默认为 "pending"
          status = statuses[node.id] || "pending";
        }
        switch (node.type) {
          case "markdown":
            return (
              <Markdown key={node.id} remarkPlugins={[remarkGfm]}>
                {node.content}
              </Markdown>
            );

          case "file":
            const lang = node.path.split(".").pop() || "bash";
            return (
              <div key={node.id} className="my-4">
                <div className="flex items-center gap-2 text-sm font-semibold mb-2">
                  <OperationStatus status={status} />
                  <span>
                    {node.action === "delete" ? "🗑️" : ""}
                    {FileOperationTypeText[node.action]}文件:{" "}
                    <strong>{node.path}</strong>
                  </span>
                </div>
                {node.action !== "delete" && (
                  <SyntaxHighlighter
                    language={lang}
                    style={vscDarkPlus}
                    customStyle={{ margin: 0, borderRadius: "0.5rem" }}
                  >
                    {node.content.trim()}
                  </SyntaxHighlighter>
                )}
              </div>
            );

          case "terminal":
            return (
              <div key={node.id} className="my-4">
                <div className="flex items-center gap-2 text-sm font-semibold mb-2">
                  <OperationStatus status={status} />
                  <span>▶️ 执行命令:</span>
                </div>
                <SyntaxHighlighter
                  language="bash"
                  style={vscDarkPlus}
                  customStyle={{ margin: 0, borderRadius: "0.5rem" }}
                >
                  {node.command}
                </SyntaxHighlighter>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
