export enum FileOperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
}


export const FileOperationTypeText: Record<FileOperationType, string> = {
  [FileOperationType.CREATE]: "创建",
  [FileOperationType.UPDATE]: "更新",
  [FileOperationType.DELETE]: "删除",
}


// 定义 Markdown 节点的结构
export interface MarkdownNode {
  id: string
  type: "markdown"
  content: string
}

// 定义 Terminal 指令节点的结构
export interface TerminalNode {
  id: string
  type: "terminal"
  command: string
  background?: boolean
}

// 定义 File 操作节点的结构
export interface FileNode {
  id: string
  type: "file"
  path: string
  action: FileOperationType
  content: string
  isClosed: boolean // 关键状态：用于标记文件内容是否已完整接收 (遇到</file>)
}

// RenderNode 是以上所有节点类型的联合类型
export type RenderNode = MarkdownNode | TerminalNode | FileNode

// --- 以下是文件中可能存在的其他相关类型 ---

export type OperationStatusType =
  | "pending"
  | "executing"
  | "completed"
  | "error"

export type OperationStatuses = Record<string, OperationStatusType>

export interface FileOperation {
  type: FileOperationType
  path: string
  content?: string
}
