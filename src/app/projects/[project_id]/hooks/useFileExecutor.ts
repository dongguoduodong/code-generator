import type { WebContainer } from "@webcontainer/api"
import type { RenderNode, FileOperation } from "@/types/ai"
import type { ExecutionResult } from "@/types/executors"

interface FileExecutorContext {
  webcontainer: WebContainer
  projectId: string
  saveOperationsToDb: (
    projectId: string,
    operations: FileOperation[]
  ) => Promise<void>
}

type FileInstruction = Extract<RenderNode, { type: "file" }>

export async function executeFileInstruction(
  instruction: FileInstruction,
  context: FileExecutorContext
): Promise<ExecutionResult> {
  const { webcontainer, projectId, saveOperationsToDb } = context
  const { path, action, content } = instruction

  try {
    if (!path || !action)
      throw new Error("文件路径或操作类型缺失，无法执行文件操作。")

    const dbOperation: FileOperation = {
      type: action,
      path,
      content: action !== "delete" ? content : undefined,
    }

    switch (action) {
      case "create":
      case "update":
        const dir = path.substring(0, path.lastIndexOf("/"))
        if (dir) {
          await webcontainer.fs.mkdir(dir, { recursive: true })
        }
        await webcontainer.fs.writeFile(path, content)
        break
      case "delete":
        await webcontainer.fs.rm(path, { recursive: true })
        break
    }

    await saveOperationsToDb(projectId, [dbOperation])

    return { success: true }
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : String(e)
    console.error(`FileExecutor failed for ${action} on ${path}:`, error)
    return { success: false, error }
  }
}
