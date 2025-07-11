import { useEffect, useLayoutEffect, useRef } from "react";
import { useMount } from "ahooks";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useWebContainer } from "./useWebContainer";
import { convertInitialFilesToFileSystem } from "../utils/fileSystem";
import { ProjectClientPageProps } from "@/types/ui";
import type { UseChatHelpers } from "@ai-sdk/react";
import { toast } from "sonner";

interface UseProjectSetupProps {
  props: ProjectClientPageProps;
  chatHook: UseChatHelpers;
}

export function useProjectSetup({ props, chatHook }: UseProjectSetupProps) {
  const { initialFiles, isFirstLoad, project } = props;
  const {
    initialAiCallFired,
    actions,
    terminal,
    currentProjectId: storeProjectId,
  } = useWorkspaceStore();
  const { setInitialAiCallFired } = actions;
  const { setFileSystem, setAiStatus, setActiveFile, resetOperationStatuses } =
    actions;
  const { initWebContainer, writeFile, runCommand } = useWebContainer(
    project.id
  );
  const hasHydrated = useRef(false);
  const setupExecuted = useRef(false);
  const webcontainer = useWorkspaceStore((s) => s.webcontainer);

  useLayoutEffect(() => {
    // 如果 store 中记录的 project ID 存在，且与当前页面的 project ID 不符
    // 这就明确表示用户从另一个项目导航而来，必须重置工作区。
    if (storeProjectId && storeProjectId !== project.id) {
      console.warn(
        `Project changed from ${storeProjectId} to ${project.id}. Resetting workspace.`
      );
      actions.resetWorkspace();
    }
  }, [project.id, storeProjectId, actions]);

  useMount(async () => {
    await initWebContainer();
  });

  useEffect(() => {
    if (!webcontainer || hasHydrated.current) return;

    const hydrate = async () => {
      hasHydrated.current = true;
      setAiStatus("正在同步初始文件...");
      const fileTree = convertInitialFilesToFileSystem(initialFiles);
      setFileSystem(fileTree);
      if (initialFiles.length > 0) {
        await Promise.all(
          initialFiles.map((file) => writeFile(file.path, file.content))
        );

        const firstFile =
          initialFiles.find((f) => !f.path.includes("/")) || initialFiles[0];
        if (firstFile) {
          setActiveFile(firstFile.path, firstFile.content);
        }
        console.log("✅ All initial files written to WebContainer.");
      }
      if (isFirstLoad && !initialAiCallFired) {
        setInitialAiCallFired();

        setAiStatus("正在初始化 AI 对话...");
        resetOperationStatuses();
        console.log("🚀 触发 AI 初始调用");
        chatHook.reload();
      } else if (!isFirstLoad) {
        setAiStatus("项目就绪");
      }
    };

    hydrate();
  }, [
    webcontainer,
    initialFiles,
    isFirstLoad,
    chatHook,
    setFileSystem,
    setActiveFile,
    writeFile,
    setAiStatus,
    resetOperationStatuses,
    runCommand,
  ]);

  useEffect(() => {
    if (webcontainer && terminal && !setupExecuted.current) {
      if (initialFiles.some((f) => f.path === "setup.sh")) {
        setupExecuted.current = true;

        setAiStatus("环境就绪，正在自动执行 setup.sh...");

        runCommand("sh", ["setup.sh"])
          .then(() => {
            setAiStatus("启动脚本执行完毕。");
            toast.success("项目已自动启动！");
          })
          .catch((err) => {
            const errorMessage =
              err instanceof Error ? err.message : "未知错误";
            setAiStatus("自动执行启动脚本时出错。");
            toast.error("自动启动项目失败", { description: errorMessage });
          });
      }
    }
  }, [webcontainer, terminal, initialFiles, runCommand, setAiStatus]);
}
