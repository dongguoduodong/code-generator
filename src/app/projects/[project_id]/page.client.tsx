"use client";

import { useEffect, useMemo, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { type ProjectClientPageProps } from "@/types/ui";
import { type RenderNode } from "@/types/ai";
import ignore from "ignore";
import { toast } from "sonner";
import { useMemoizedFn } from "ahooks";

import { useProjectSetup } from "./hooks/useProjectSetup";
import { useStreamParser } from "./hooks/useStreamParser";
import { filterAndSnapshotFileSystem } from "./utils/fileSystem";
import ChatPanel from "./components/ChatPanel";
import WorkspacePanel from "./components/WorkspacePanel";
import { ChatRequestOptions } from "ai";

export default function ProjectClientPage(props: ProjectClientPageProps) {
  const { project } = props;
  const actions = useWorkspaceStore((state) => state.actions);
  const executionError = useWorkspaceStore((state) => state.executionError);
  const {
    enqueueInstructions,
    setGitignoreParser,
    setExecutionError,
    setAiStatus,
  } = actions;
  const webcontainer = useWorkspaceStore((s) => s.webcontainer);
  const processedNodeIds = useRef(new Set<string>());

  useEffect(() => {
    return () => {
      const { resetWorkspace } = useWorkspaceStore.getState().actions;
      const wc = useWorkspaceStore.getState().webcontainer;

      if (wc) {
        console.log("Project page unmounting, resetting workspace...");
        resetWorkspace();
      }
    };
  }, []);

  const gitignoreParser = useMemo(() => {
    const ig = ignore();
    if (props.initialGitignoreContent) {
      ig.add(props.initialGitignoreContent);
    }
    ig.add([".git/", "node_modules", "dist"]);
    return ig;
  }, [props.initialGitignoreContent]);

  useEffect(() => {
    setGitignoreParser(gitignoreParser);
  }, [gitignoreParser, setGitignoreParser]);

  const chatHook = useChat({
    api: `/api/projects/${props.project.id}/chat`,
    initialMessages: props.initialMessages,
    body: {
      projectId: props.project.id,
    },
    onFinish: () => {
      setAiStatus("AI 已完成任务，正在待命...");
      processedNodeIds.current.clear();
    },
    onError: (err) => setAiStatus(`出现错误: ${err.message}`),
  });

  const handleSubmitWithContext = useMemoizedFn(
    async (
      e: React.FormEvent<HTMLFormElement>,
      chatRequestOptions?: ChatRequestOptions
    ) => {
      e.preventDefault();

      const trimmedInput = chatHook.input.trim();
      if (!trimmedInput) {
        return;
      }

      chatHook.setInput(trimmedInput);

      if (!webcontainer) {
        toast.error("开发容器尚未就绪，请稍候。");
        return;
      }

      const snapshot = await filterAndSnapshotFileSystem(
        webcontainer,
        gitignoreParser
      );

      const mergedChatRequestOptions: ChatRequestOptions = {
        ...chatRequestOptions,
        body: {
          ...(chatRequestOptions?.body ?? {}),
          fileSystemSnapshot: snapshot,
        },
      };

      chatHook.handleSubmit(e, mergedChatRequestOptions);
    }
  );

  const finalChatHook = {
    ...chatHook,
    handleSubmit: (
      event?: { preventDefault?: (() => void) | undefined } | undefined,
      chatRequestOptions?: ChatRequestOptions
    ) => {
      if (event && typeof event.preventDefault === "function") {
        event.preventDefault();
      }
      const syntheticEvent = {
        preventDefault: () => {},
        ...(event ?? {}),
      } as React.FormEvent<HTMLFormElement>;
      handleSubmitWithContext(syntheticEvent, chatRequestOptions);
    },
  };

  useEffect(() => {
    if (executionError) {
      console.log("Execution error detected:", executionError);
      chatHook.append({
        role: "user",
        content: executionError,
      });
      setExecutionError(null);
    }
  }, [executionError, chatHook.append, setExecutionError]);

  useProjectSetup({ props, chatHook });

  const lastAssistantMessage = chatHook.messages.findLast(
    (m) => m.role === "assistant"
  );
  const structuredResponse = useStreamParser(
    lastAssistantMessage?.content ?? "",
    lastAssistantMessage?.id ?? ""
  );

  const { status } = chatHook;
  const prevIsLoading = useRef(false);

  useEffect(() => {
    // 这个 effect 的核心任务是：在 isLoading 从 true 变为 false 的那一刻，
    // 或者在 isLoading 为 true 的期间，处理并派发指令。
    // 这可以保证我们只处理实时的AI响应，而忽略历史消息。

    const isStreaming = status === "submitted" || status === "streaming";
    const justFinishedStreaming = prevIsLoading.current && !isStreaming;
    if (isStreaming || justFinishedStreaming) {
      // 第 1 步：纯粹地过滤出所有准备就绪的节点，不过早修改任何状态。
      const allReadyNodes = structuredResponse.filter((node: RenderNode) => {
        const isReady =
          node.type === "terminal" || (node.type === "file" && node.isClosed);
        return isReady;
      });

      // 第 2 步：从准备就绪的节点中，筛选出那些我们尚未“拉黑”的。
      const newNodesToExecute = allReadyNodes.filter(
        (node) => !processedNodeIds.current.has(node.id)
      );

      // 第 3 步：如果确实有新的、需要执行的指令...
      if (newNodesToExecute.length > 0) {
        newNodesToExecute.forEach((node) =>
          processedNodeIds.current.add(node.id)
        );
        enqueueInstructions(newNodesToExecute, project.id);
      }
    }

    // 在 effect 的最后，更新 prevIsLoading 的值为当前值，供下一次渲染使用
    prevIsLoading.current = isStreaming;
  }, [structuredResponse, status, enqueueInstructions]);

  return (
    <div className="flex h-screen bg-[#0d1117] text-neutral-300 font-sans">
      <ChatPanel chatHook={finalChatHook} project={props.project} />
      <WorkspacePanel />
    </div>
  );
}
