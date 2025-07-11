import type { WebContainer } from "@webcontainer/api";
import type { Terminal } from "xterm";

/**
 * 执行器所需的上下文依赖。
 * 通过对象传递，而不是长长的参数列表，便于未来扩展。
 */
export interface ExecutionContext {
  webcontainer: WebContainer;
  terminal: Terminal;
  saveOperationsToDb: (
    operations: {
      type: string;
      path: string;
      content?: string;
    }[]
  ) => Promise<void>;
}

export interface ExecutionResult {
  success: boolean;
  error?: string;
}
