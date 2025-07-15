"use client";

import { useCallback } from "react";
import { WebContainer } from "@webcontainer/api";
import { toast } from "sonner";
import {
  useWorkspaceStore,
  useWorkspaceStoreApi,
} from "@/stores/WorkspaceStoreProvider";

/**
 * 一个封装了 WebContainer 核心交互逻辑的自定义 Hook。
 * 职责聚焦于 WebContainer 的生命周期管理和文件I/O。
 * @param projectId - 当前项目的ID，用于关联 WebContainer 实例。
 */
export function useWebContainer(projectId: string) {
  const actions = useWorkspaceStore((state) => state.actions);
  const { setWebcontainer, setPreviewUrl } = actions;
  const storeApi = useWorkspaceStoreApi();
  /**
   * 初始化 WebContainer 实例。
   * 如果实例已存在则直接返回，否则启动一个新的实例并设置监听器。
   */
  const initWebContainer = useCallback(async () => {
    const currentWc = storeApi.getState().webcontainer;
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

  /**
   * 安全地卸载 WebContainer 实例并重置相关状态。
   */
  const teardown = useCallback(() => {
    const wc = storeApi.getState().webcontainer;
    wc?.teardown();
    setWebcontainer(null, null);
  }, [setWebcontainer]);

  /**
   * 在 WebContainer 的虚拟文件系统中写入或更新一个文件。
   * 会自动创建不存在的目录。
   */
  const writeFile = useCallback(async (path: string, content: string) => {
    const wc = storeApi.getState().webcontainer;
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

  /**
   * 从 WebContainer 的虚拟文件系统中读取一个文件。
   */
  const readFile = useCallback(async (path: string): Promise<string | null> => {
    const wc = storeApi.getState().webcontainer;
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

  /**
   * 从 WebContainer 的虚拟文件系统中删除一个文件或目录。
   */
  const deleteFile = useCallback(async (path: string) => {
    const wc = storeApi.getState().webcontainer;
    if (!wc) {
      throw new Error("WebContainer not ready to delete file.");
    }
    await wc.fs.rm(path, { recursive: true });
  }, []);

  return {
    initWebContainer,
    teardown,
    writeFile,
    readFile,
    deleteFile,
  };
}
