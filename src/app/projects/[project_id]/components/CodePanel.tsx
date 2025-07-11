"use client";

import React, { useEffect, useRef, useMemo, useCallback } from "react";
import { Terminal } from "xterm";
import "xterm/css/xterm.css";
import { FitAddon } from "xterm-addon-fit";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { json } from "@codemirror/lang-json";
import { markdown as md } from "@codemirror/lang-markdown";
import { okaidia } from "@uiw/codemirror-theme-okaidia";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TerminalSquare } from "lucide-react";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useWebContainer } from "../hooks/useWebContainer";
import { toast } from "sonner";
import { useDebounceFn } from "ahooks";
import { FileOperationType } from "@/types/ai";
import { apiClient } from "@/lib/apiClient";
import { FileTree } from "./FileTree";
import type { WebContainerProcess } from "@webcontainer/api";

const getLanguageExtension = (filePath: string | null) => {
  if (!filePath) return [];
  const ext = filePath?.split(".").pop();
  switch (ext) {
    case "js":
    case "jsx":
    case "ts":
    case "tsx":
      return [javascript({ jsx: true, typescript: true })];
    case "css":
      return [css()];
    case "html":
      return [html()];
    case "json":
      return [json()];
    case "md":
      return [md()];
    default:
      return [];
  }
};

export function CodePanel() {
  const {
    fileSystem,
    activeFile,
    editorContent,
    webcontainer,
    terminal,
    actions,
    currentProjectId,
  } = useWorkspaceStore();

  const { setTerminal, setActiveFile, setEditorContent } = actions;

  const { readFile, writeFile } = useWebContainer(currentProjectId || "");

  const terminalRef = useRef<HTMLDivElement>(null);
  const termInstanceRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const shellProcessRef = useRef<WebContainerProcess | null>(null);
  const isTerminalInitialized = useRef(false);

  const { run: debouncedSaveToDb } = useDebounceFn(
    async (path: string, content: string) => {
      const projectId = window.location.pathname.split("/projects/")[1];
      if (!projectId) return;
      toast.info("正在保存改动...");
      await apiClient(`/api/projects/${projectId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operations: [{ type: FileOperationType.UPDATE, path, content }],
        }),
      });
      toast.success("改动已保存！");
    },
    { wait: 1500 }
  );

  const { run: debouncedFit } = useDebounceFn(
    () => {
      const termEl = terminalRef.current;
      if (
        termEl &&
        termEl.clientWidth > 0 &&
        termEl.clientHeight > 0 &&
        fitAddonRef.current
      ) {
        setTimeout(() => {
          try {
            fitAddonRef.current?.fit();
          } catch (e) {
            console.warn(
              "Terminal fit failed, container might not be ready:",
              e
            );
          }
        }, 0);
      }
    },
    { wait: 100 }
  );

  const handleFileClick = useCallback(
    async (path: string) => {
      const content = await readFile(path);
      if (content === null) {
        toast.error(`读取文件 ${path} 失败`);
        setActiveFile(path, "");
      } else {
        setActiveFile(path, content);
      }
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
    if (isTerminalInitialized.current || !terminalRef.current) return;

    isTerminalInitialized.current = true;

    const initTimeoutId = setTimeout(() => {
      if (!terminalRef.current) return;

      const term = new Terminal({
        convertEol: true,
        cursorBlink: true,
        theme: { background: "#0D1117" },
        rows: 15,
        fontSize: 13,
        lineHeight: 1.2,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      term.open(terminalRef.current);

      termInstanceRef.current = term;
      fitAddonRef.current = fitAddon;
      setTerminal(term);

      debouncedFit();

      const resizeObserver = new ResizeObserver(() => {
        debouncedFit();
      });
      resizeObserver.observe(terminalRef.current);

      (
        term as Terminal & { _resizeObserver?: ResizeObserver }
      )._resizeObserver = resizeObserver;
    }, 0);
    return () => {
      clearTimeout(initTimeoutId);

      if (termInstanceRef.current) {
        const observer = (
          termInstanceRef.current as Terminal & {
            _resizeObserver?: ResizeObserver;
          }
        )._resizeObserver;
        if (observer) {
          observer.disconnect();
        }
        termInstanceRef.current.dispose();
      }

      termInstanceRef.current = null;
      fitAddonRef.current = null;
      setTerminal(null);
      isTerminalInitialized.current = false;
    };
  }, [setTerminal, debouncedFit]);

  useEffect(() => {
    if (!webcontainer || !terminal) return;

    const linkTerminalToShell = async () => {
      if (shellProcessRef.current) {
        shellProcessRef.current.kill();
      }

      const shellProcess = await webcontainer.spawn("jsh", {
        terminal: {
          cols: terminal.cols,
          rows: terminal.rows,
        },
      });
      shellProcessRef.current = shellProcess;

      shellProcess.output.pipeTo(
        new WritableStream({
          write(data) {
            terminal.write(data);
          },
        })
      );

      const writer = shellProcess.input.getWriter();

      // [数据流: 终端 -> Shell] 监听终端的用户输入事件，并将数据写入shell的输入流
      const onDataDisposable = terminal.onData((data) => {
        writer.write(data);
      });

      // 监听终端尺寸变化，并同步到shell进程
      const onResizeDisposable = terminal.onResize((dim) => {
        shellProcess.resize(dim);
      });

      // 当shell进程退出时（例如用户按Ctrl+C），自动重启一个新的shell
      shellProcess.exit.then(() => {
        shellProcessRef.current = null;
        terminal.write(
          "\r\n\x1b[33mShell session ended. Starting a new one...\x1b[0m\r\n"
        );
        // 清理旧的监听器，然后重新连接
        onDataDisposable.dispose();
        onResizeDisposable.dispose();
        linkTerminalToShell();
      });
    };

    linkTerminalToShell();

    return () => {
      if (shellProcessRef.current) {
        shellProcessRef.current.kill();
        shellProcessRef.current = null;
      }
    };
  }, [webcontainer, terminal]);

  return (
    <div className="flex-1 flex overflow-hidden">
      <aside className="w-64 flex-shrink-0 bg-[#161b22] p-2 border-r border-neutral-800 flex flex-col">
        <h3 className="text-sm font-semibold mb-2 px-2 text-neutral-400">
          文件浏览器
        </h3>
        <ScrollArea className="flex-1">
          {/* ✨ Bug修复: 移除 w-[max-content]，让其自然填充 */}
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
              }}
              style={{ height: "100%" }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-neutral-500 transition-none">
              <p>请从左侧选择一个文件进行编辑</p>
            </div>
          )}
        </div>
        <div className="h-[40%] border-t border-neutral-800 flex flex-col">
          <div className="bg-[#161b22] px-4 py-1.5 text-xs font-semibold flex items-center text-neutral-300 border-b border-neutral-800">
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
