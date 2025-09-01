export enum FileOperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
}

export type FileOperationTypeValues = FileOperationType;

export const FileOperationTypeText: Record<FileOperationType, string> = {
  [FileOperationType.CREATE]: "创建",
  [FileOperationType.UPDATE]: "更新",
  [FileOperationType.DELETE]: "删除",
};

export type RenderNode =
  | { id: string; type: "markdown"; content: string }
  | {
      id: string
      type: "file"
      path?: string // Path is now optional
      action?: FileOperationType
      content: string
      isClosed: boolean
    }
  | { id: string; type: "terminal"; command: string; background?: boolean }

export type OperationStatusType =
  | "pending"
  | "executing"
  | "completed"
  | "error";

export type OperationStatuses = Record<string, OperationStatusType>;

export interface FileOperation {
  type: FileOperationType;
  path: string;
  content?: string;
}
