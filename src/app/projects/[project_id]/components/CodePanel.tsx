"use client";

import React, { useEffect, useRef, useMemo, useCallback } from "react";
import { Terminal } from "xterm";
import "xterm/css/xterm.css";
import { FitAddon } from "xterm-addon-fit";
import CodeMirror from "@uiw/react-codemirror";
import { okaidia } from "@uiw/codemirror-theme-okaidia";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Lightbulb, TerminalSquare } from "lucide-react";
import { useWorkspaceStore } from "@/stores/WorkspaceStoreProvider";
import { useWebContainer } from "../hooks/useWebContainer";
import { toast } from "sonner";
import { useDebounceFn } from "ahooks";
import { FileOperationType } from "@/types/ai";
import { apiClient } from "@/lib/apiClient";
import { FileTree } from "./FileTree";
import { Button } from "@/components/ui/button";
import { getLanguageExtension } from "../utils/markdown";
import { cn } from "@/lib/utils";

export function CodePanel({
  onFixDevError,
}: {
  onFixDevError: (errorLog: string) => void;
}) {
  const fileSystem = useWorkspaceStore((state) => state.fileSystem);
  const activeFile = useWorkspaceStore((state) => state.activeFile);
  const editorContent = useWorkspaceStore((state) => state.editorContent);
  const actions = useWorkspaceStore((state) => state.actions);
  const currentProjectId = useWorkspaceStore((state) => state.currentProjectId);
  const devErrors = useWorkspaceStore((state) => state.devErrors);

  const { setActiveFile, setEditorContent, dismissDevError, setTerminal } =
    actions;
  const { readFile, writeFile } = useWebContainer(currentProjectId || "");

  const terminalRef = useRef<HTMLDivElement>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const isTerminalInitialized = useRef(false);

  const { run: debouncedSaveToDb } = useDebounceFn(
    async (path: string, content: string) => {
      if (!currentProjectId) return;
      toast.info("正在保存改动...");
      try {
        await apiClient(`/api/projects/${currentProjectId}/files`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operations: [{ type: FileOperationType.UPDATE, path, content }],
            projectId: currentProjectId,
          }),
        });
        toast.success("改动已保存！");
      } catch (error) {
        toast.error("保存失败", {
          description: error instanceof Error ? error.message : "未知错误",
        });
      }
    },
    { wait: 2000 }
  );

  const { run: debouncedFit } = useDebounceFn(
    () => fitAddonRef.current?.fit(),
    { wait: 50 }
  );

  const handleFileClick = useCallback(
    async (path: string) => {
      const content = await readFile(path);
      setActiveFile(path, content ?? "");
    },
    [readFile, setActiveFile]
  );

  const handleEditorChange = useCallback(
    (value: string) => {
      setEditorContent(value);
      if (activeFile) {
        writeFile(activeFile, value);
        debouncedSaveToDb(activeFile, value);
      }
    },
    [activeFile, setEditorContent, writeFile, debouncedSaveToDb]
  );

  const editorExtensions = useMemo(
    () => getLanguageExtension(activeFile),
    [activeFile]
  );

  useEffect(() => {
    if (!terminalRef.current || isTerminalInitialized.current) {
      console.log(
        "[CodePanel Effect] Aborting: terminalRef not ready or already initialized."
      );
      return;
    }

    try {
      isTerminalInitialized.current = true;

      const term = new Terminal({
        convertEol: true,
        cursorBlink: true,
        theme: { background: "#0D1117", foreground: "#e0e0e0" },
        rows: 15,
        fontSize: 13,
        fontFamily: "var(--font-geist-mono), monospace",
        lineHeight: 1.4,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      term.open(terminalRef.current);

      fitAddonRef.current = fitAddon;
      setTerminal(term);

      debouncedFit();
      const resizeObserver = new ResizeObserver(debouncedFit);
      if (terminalRef.current) {
        resizeObserver.observe(terminalRef.current);
      }

      return () => {
        resizeObserver.disconnect();
        term.dispose();
        setTerminal(null);
        isTerminalInitialized.current = false;
      };
    } catch (error) {
      console.error(
        "%c[CodePanel Effect] CRITICAL FAILURE during terminal initialization:",
        "color: red; font-weight: bold;",
        error
      );
      toast.error("终端初始化失败", {
        description: "无法加载代码终端，请检查浏览器控制台以获取详细信息。",
      });
    }
  }, [setTerminal, debouncedFit]);

  const activeErrors = devErrors.filter((e) => e.status === "active");

  return (
    <div className="flex-1 flex overflow-hidden">
      <aside className="w-64 flex-shrink-0 bg-[#161b22] p-2 border-r border-neutral-800 flex flex-col">
        <h3 className="text-sm font-semibold mb-2 px-2 text-neutral-400">
          文件浏览器
        </h3>
        <ScrollArea className="flex-1">
          <div className="space-y-1 pr-2">
            {fileSystem.length > 0 ? (
              <FileTree
                nodes={fileSystem}
                onFileClick={handleFileClick}
                activeFile={activeFile}
              />
            ) : (
              <p className="px-2 text-xs text-neutral-500">
                等待 AI 创建文件...
              </p>
            )}
          </div>
        </ScrollArea>
      </aside>

      <div className="flex-1 flex flex-col">
        <div className="flex-1 overflow-hidden h-[60%]">
          {activeFile ? (
            <CodeMirror
              key={activeFile}
              value={editorContent}
              onChange={handleEditorChange}
              height="100%"
              theme={okaidia}
              extensions={editorExtensions}
              basicSetup={{
                foldGutter: true,
                allowMultipleSelections: true,
                indentOnInput: true,
                lineNumbers: true,
                autocompletion: true,
              }}
              style={{ height: "100%" }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-neutral-500">
              <p>请从左侧选择一个文件进行编辑</p>
            </div>
          )}
        </div>
        <div className="h-[40%] border-t border-neutral-800 flex flex-col relative">
          {activeErrors.length > 0 && (
            <div className="absolute top-0 left-0 right-0 z-10 flex flex-col max-h-[100%] overflow-y-auto">
              {activeErrors.map((error) => (
                <div
                  key={error.id}
                  className="bg-yellow-900/80 backdrop-blur-sm p-2 border-b border-yellow-700/60 flex justify-between items-center gap-4"
                >
                  <div className="flex items-start gap-2 text-yellow-200 text-sm overflow-hidden">
                    <Lightbulb size={16} className="flex-shrink-0 mt-0.5" />
                    <p className="truncate" title={error.log}>
                      AI 检测到问题: {error.log.split("\n")[0]}
                    </p>
                  </div>
                  <div className="flex-shrink-0 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => dismissDevError(error.id)}
                    >
                      忽略
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => onFixDevError(error.log)}
                      className="bg-yellow-500 hover:bg-yellow-600 text-black"
                    >
                      AI 修复
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div
            className={cn(
              "bg-[#161b22] px-4 py-1.5 text-xs font-semibold flex items-center text-neutral-300 border-b border-neutral-800",
              activeErrors.length > 0 && "opacity-0 pointer-events-none"
            )}
          >
            <TerminalSquare size={14} className="mr-2" /> 终端
          </div>
          <div
            ref={terminalRef}
            className="w-full flex-1 bg-[#0D1117] overflow-hidden p-2"
          ></div>
        </div>
      </div>
    </div>
  );
}
