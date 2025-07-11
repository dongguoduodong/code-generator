"use client";

import { useCallback } from "react";
import { WebContainer } from "@webcontainer/api";
import { toast } from "sonner";
import { useWorkspaceStore } from "@/stores/workspaceStore";

export function useWebContainer(projectId: string) {
  const actions = useWorkspaceStore((state) => state.actions);

  const { setWebcontainer, setPreviewUrl } = actions;

  const runCommand = useCallback(
    async (command: string, args: string[] = []) => {
      const wc = useWorkspaceStore.getState().webcontainer;
      const term = useWorkspaceStore.getState().terminal;

      if (!wc || !term) {
        const message = !wc
          ? "WebContainer is not ready."
          : "Terminal is not ready.";
        toast.warning("环境尚未就绪，命令执行已跳过", { description: message });
        throw new Error(`Execution skipped: ${message}`);
      }

      const fullCommand = `${command} ${args.join(" ")}`;
      term.write(`\r\n\x1b[1;32m$ \x1b[0m${fullCommand}\r\n`);

      const process = await wc.spawn(command, args);

      let combinedOutput = "";
      process.output.pipeTo(
        new WritableStream({
          write(data) {
            combinedOutput += data;
            term.write(data);
          },
        })
      );

      const exitCode = await process.exit;

      if (exitCode !== 0) {
        term.write(
          `\r\n\x1b[1;31mProcess exited with error code ${exitCode}\x1b[0m\r\n`
        );
        throw new Error(
          `Command failed with exit code ${exitCode}.\n--- OUTPUT ---\n${combinedOutput}`
        );
      }

      term.write(
        `\r\n\x1b[1;33mProcess exited with code ${exitCode}\x1b[0m\r\n`
      );
    },
    []
  );

  const writeFile = useCallback(async (path: string, content: string) => {
    const wc = useWorkspaceStore.getState().webcontainer;
    if (!wc) {
      toast.warning("WebContainer not ready, file write operation skipped.");
      return;
    }
    const dir = path.substring(0, path.lastIndexOf("/"));
    if (dir) {
      await wc.fs.mkdir(dir, { recursive: true });
    }
    await wc.fs.writeFile(path, content);
  }, []);

  const readFile = useCallback(async (path: string): Promise<string | null> => {
    const wc = useWorkspaceStore.getState().webcontainer;
    if (!wc) {
      toast.warning("开发容器尚未就绪，请稍候。");
      return null;
    }
    try {
      return await wc.fs.readFile(path, "utf-8");
    } catch (e) {
      console.error(`Error reading file "${path}":`, e);
      return null;
    }
  }, []);

  const deleteFile = useCallback(async (path: string) => {
    const wc = useWorkspaceStore.getState().webcontainer;
    if (!wc) {
      throw new Error("WebContainer not ready to delete file.");
    }
    await wc.fs.rm(path, { recursive: true });
  }, []);

  const initWebContainer = useCallback(async () => {
    const currentWc = useWorkspaceStore.getState().webcontainer;
    if (currentWc) return;

    toast.loading("正在启动云端开发环境...", { id: "wc-boot" });
    try {
      const wc = await WebContainer.boot();
      setWebcontainer(wc, projectId);

      wc.on("server-ready", (port, url) => {
        setPreviewUrl(`${url}?t=${Date.now()}`);
        toast.success("预览服务器已就绪！");
      });
      wc.on("error", (error) =>
        toast.error("开发容器发生错误", { description: error.message })
      );

      toast.success("开发环境已就绪！", { id: "wc-boot" });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      toast.error("启动开发环境失败", {
        id: "wc-boot",
        description: errorMessage,
      });
    }
  }, [setWebcontainer, projectId, setPreviewUrl]);

  const teardown = useCallback(() => {
    const wc = useWorkspaceStore.getState().webcontainer;
    wc?.teardown();
    setWebcontainer(null, null);
  }, [setWebcontainer]);

  const runBackgroundTask = useCallback(
    async (
      command: string,
      args: string[],
      onOutput: (data: string) => void
    ) => {
      const wc = useWorkspaceStore.getState().webcontainer;

      if (!wc) {
        toast.error("WebContainer is not ready.");
        return null;
      }

      const process = await wc.spawn(command, args);
      process.output.pipeTo(new WritableStream({ write: onOutput }));

      return {
        process,
        stop: () => {
          process.kill();
          onOutput("\r\nTask stopped by user.\r\n");
        },
      };
    },
    []
  );

  return {
    initWebContainer,
    writeFile,
    readFile,
    runCommand,
    deleteFile,
    teardown,
    runBackgroundTask,
  };
}
