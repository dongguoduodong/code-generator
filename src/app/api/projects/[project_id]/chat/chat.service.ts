import { performance } from "perf_hooks"
import {
  streamText,
  generateObject,
  CoreMessage,
  StreamTextResult,
  LanguageModelV1,
} from "ai"
import { NextResponse, NextRequest } from "next/server"
import ignore from "ignore"
import { User } from "@supabase/supabase-js"

import { saveMessageInDb } from "@/lib/db/message"
import { getFilesForProject } from "@/lib/db/file"
import { customOpenai } from "@/lib/openai"
import { authenticateRoute } from "@/lib/api/auth"
import { getTemplateById } from "@/lib/templates"
import {
  ROUTER_PROMPT,
  PLANNER_PROMPT,
  CODER_PROMPT,
  E2E_PROMPT,
  CUSTOMIZER_PROMPT,
  FileIdentificationSchema,
  FILE_IDENTIFIER_PROMPT,
} from "@/lib/prompts"
import { RouterDecisionSchema, type RouterDecision } from "@/lib/schemas"
import { SupabaseClient } from "@/types/database"

export interface ChatContext {
  user: User
  supabase: SupabaseClient
  projectId: string
  messages: CoreMessage[]
  fileContext: string
  conversationHistory: string
}

export interface PerformanceMetrics {
  preJudgmentTime: number | null
  routerTime: number | null
}

const POSITIVE_CONFIRMATIONS = new Set([
  "yes",
  "ok",
  "okay",
  "proceed",
  "continue",
  "go ahead",
  "looks good",
  "sounds good",
  "do it",
  "好的",
  "可以",
  "继续",
  "执行",
  "没问题",
  "就这样做",
  "同意",
  "批准",
  "确认",
  "执行计划",
])

/**
 * 预判路由器：快速处理高确定性请求，避免不必要的AI调用以提升性能。
 * @param messages 对话历史
 * @returns 快速通道决策或 null
 */
export function preJudgmentRouter(
  messages: CoreMessage[]
): RouterDecision | null {
  if (messages.length === 0) return null

  const lastUserMessage = messages[messages.length - 1]
  if (
    lastUserMessage.role !== "user" ||
    typeof lastUserMessage.content !== "string"
  ) {
    return null
  }

  const userContent = lastUserMessage.content.trim().toLowerCase()

  // 场景一: 系统错误处理
  if (userContent.startsWith("[system_error]")) {
    return {
      decision: "PLAN",
      reason: "Pre-judged for system error.",
      next_prompt_input: lastUserMessage.content,
    }
  }

  // 场景二: 计划批准
  if (messages.length > 1) {
    const previousMessage = messages[messages.length - 2]
    const isConfirmation = POSITIVE_CONFIRMATIONS.has(
      userContent.replace(/[.!?]/g, "")
    )

    if (
      isConfirmation &&
      previousMessage.role === "assistant" &&
      typeof previousMessage.content === "string" &&
      (previousMessage.content.trim().endsWith("?") ||
        previousMessage.content.trim().endsWith("？"))
    ) {
      return {
        decision: "CODE",
        reason: "Pre-judged for plan approval.",
        next_prompt_input: previousMessage.content,
      }
    }
  }

  return null
}

/**
 * 决定下一步操作，结合了快速预判和AI Router Agent。
 * @param context - 聊天上下文
 * @returns 路由决策和性能指标
 */
export async function determineNextStep(
  context: ChatContext
): Promise<{ decision: RouterDecision; performance: PerformanceMetrics }> {
  const { messages, conversationHistory, fileContext } = context

  const metrics: PerformanceMetrics = {
    preJudgmentTime: null,
    routerTime: null,
  }

  const preJudgmentStartTime = performance.now()
  const fastPathDecision = preJudgmentRouter(messages)

  if (fastPathDecision) {
    metrics.preJudgmentTime = performance.now() - preJudgmentStartTime
    console.log(
      `[PERF] Pre-judgment router took: ${metrics.preJudgmentTime.toFixed(2)}ms`
    )
    return { decision: fastPathDecision, performance: metrics }
  }

  const routerSystemPrompt = ROUTER_PROMPT.replace(
    "{conversation_history}",
    conversationHistory
  ).replace("{file_system_snapshot}", fileContext)

  const routerStartTime = performance.now()
  console.log("[PERF] Calling Router Agent...")
  const { object: decision } = await generateObject<RouterDecision>({
    model: customOpenai("gemini-2.5-flash"),
    system: routerSystemPrompt,
    prompt: `User's latest message: "${messages[messages.length - 1].content}"`,
    schema: RouterDecisionSchema,
  })

  metrics.routerTime = performance.now() - routerStartTime
  console.log(
    `[PERF] Router Agent decision took: ${metrics.routerTime.toFixed(2)}ms`
  )

  return { decision, performance: metrics }
}

/**
 * 创建一个AI流式响应，并附加数据库保存逻辑。
 * @param context - 聊天上下文
 * @param model - AI模型
 * @param system - 系统提示
 * @param prompt - 用户提示
 * @returns 一个 Promise，解析为 StreamTextResult 对象
 */
export async function createAiStream(
  context: ChatContext,
  model: LanguageModelV1,
  system: string,
  prompt: string
): Promise<StreamTextResult<never, never>> {
  return streamText({
    model,
    system,
    prompt,
    async onFinish(result) {
      saveMessageInDb(context.supabase, {
        projectId: context.projectId,
        content: result.text,
        role: "assistant",
      }).catch(console.error)
    },
  })
}

/**
 * 执行端到端（End-to-End）工作流。
 * @param context - 聊天上下文
 * @returns 一个 Response 对象
 */
export async function executeEndToEndWorkflow(
  context: ChatContext
): Promise<Response> {
  console.log("Executing with End-to-End Model...")
  const { conversationHistory, fileContext, messages } = context
  const systemPrompt = E2E_PROMPT.replace(
    "{conversation_history}",
    conversationHistory
  ).replace("{file_system_snapshot}", fileContext)

  const streamResult = await createAiStream(
    context,
    customOpenai("gemini-2.5-pro"),
    systemPrompt,
    `User's latest request: "${messages[messages.length - 1].content}"`
  )

  return streamResult.toDataStreamResponse()
}

async function buildModificationContext(
  plan: string,
  fileList: string[],
  context: ChatContext
): Promise<string> {
  try {
    // 调用文件识别 Agent
    const fileIdentifierStartTime = performance.now()
    console.log("[PERF] Calling File Identification Agent...")
    const { object: identifiedFiles } = await generateObject({
      model: customOpenai("gemini-2.5-flash"), // 使用一个快速的模型
      prompt: `Based on the plan and the file list, identify the relevant files.\n\nPLAN:\n${plan}\n\nFILE SYSTEM LIST:\n${JSON.stringify(
        fileList,
        null,
        2
      )}`,
      schema: FileIdentificationSchema,
      system: FILE_IDENTIFIER_PROMPT,
    })
    console.log(
      `[PERF] File Identification Agent took: ${(
        performance.now() - fileIdentifierStartTime
      ).toFixed(2)}ms`
    )

    const relevantFilePaths = identifiedFiles.files
    if (relevantFilePaths.length === 0) {
      return "No relevant files were identified by the context agent. The Coder must rely on the plan and file system snapshot alone."
    }

    // 从数据库获取这些文件的当前内容
    const { data: files, error } = await getFilesForProject(
      context.supabase,
      context.projectId,
      context.user.id
    )

    if (error) {
      console.error("Failed to fetch files for context injection:", error)
      return "Warning: Could not fetch file content for context."
    }

    const relevantFileContents =
      files?.filter((file) => relevantFilePaths.includes(file.path)) || []

    // 构建注入的上下文字符串
    return relevantFileContents
      .map((file) => `--- FILE: ${file.path} ---\n${file.content}\n`)
      .join("\n")
  } catch (err) {
    console.error("Error in File Identification Agent:", err)
    return "Critical Error: The file identification agent failed. The Coder must proceed with caution."
  }
}

/**
 * 执行多智能体（Agentic）工作流。
 * @param context - 聊天上下文
 * @returns 一个 Response 对象
 */
export async function executeAgenticWorkflow(
  context: ChatContext
): Promise<Response> {
  const workflowStartTime = performance.now()
  console.log("[PERF] Starting Agentic Workflow...")

  const { decision, performance: stepPerformance } = await determineNextStep(
    context
  )

  console.log("Router Decision:", decision)
  let streamResult: StreamTextResult<never, never>

  const secondAgentCallStartTime = performance.now()
  console.log(
    `[PERF] Calling next agent based on decision: ${decision.decision}`
  )

  if (decision.templateId && decision.decision === "PLAN") {
    const template = getTemplateById(decision.templateId)
    if (template) {
      const pm = decision.packageManager || "npm"
      const installCommand =
        pm === "pnpm" ? "pnpm install" : pm === "yarn" ? "yarn" : "npm install"
      const devCommand =
        pm === "pnpm" ? "pnpm dev" : pm === "yarn" ? "yarn dev" : "npm run dev"

      const processedPlanBody = template.planBody.join("\n")
      const processedExecutionSteps = template.planExecutionSteps
        .join("\n")
        .replace(/\{\{PM_INSTALL\}\}/g, installCommand)
        .replace(/\{\{PM_RUN_DEV\}\}/g, devCommand)

      const basePlan = `${processedPlanBody}\n${processedExecutionSteps}`
      const systemPrompt = CUSTOMIZER_PROMPT.replace(
        "{base_plan}",
        basePlan
      ).replace(
        "{custom_instructions}",
        decision.customInstructions || "Implement the base template."
      )

      streamResult = await createAiStream(
        context,
        customOpenai("gemini-2.5-pro"),
        systemPrompt,
        decision.next_prompt_input
      )
    } else {
      // 容错：模板未找到，降级为 Planner
      console.warn(
        `Template '${decision.templateId}' not found. Falling back to Planner Agent.`
      )
      streamResult = await createAiStream(
        context,
        customOpenai("gemini-2.5-pro"),
        PLANNER_PROMPT,
        decision.next_prompt_input
      )
    }
  } else if (decision.decision === "PLAN") {
    const { conversationHistory, fileContext } = context
    const finalPlannerPrompt = PLANNER_PROMPT.replace(
      "{conversation_history}",
      conversationHistory
    ).replace("{file_system_snapshot}", fileContext)
    streamResult = await createAiStream(
      context,
      customOpenai("gemini-2.5-pro"),
      finalPlannerPrompt,
      decision.next_prompt_input
    )
  } else {
    const plan = decision.next_prompt_input
    const { conversationHistory, fileContext } = context
    // 从 ChatContext 中获取文件快照 (所有文件的列表)
    const fileListSnapshot = context.fileContext.startsWith(
      "File system snapshot:\n"
    )
      ? context.fileContext
          .substring("File system snapshot:\n".length)
          .split("\n")
      : []

    // 调用新的辅助函数来构建上下文
    const modificationContext = await buildModificationContext(
      plan,
      fileListSnapshot,
      context
    )

    const finalSystemPrompt = CODER_PROMPT.replace(
      "{relevant_file_content}",
      modificationContext
    )
      .replace("{conversation_history}", conversationHistory)
      .replace("{file_system_snapshot}", fileContext)

    streamResult = await createAiStream(
      context,
      customOpenai("gemini-2.5-pro"),
      finalSystemPrompt,
      decision.next_prompt_input
    )
  }

  console.log(
    `[PERF] Second Agent call (${decision.decision}) took: ${(
      performance.now() - secondAgentCallStartTime
    ).toFixed(2)}ms`
  )

  const response = streamResult.toDataStreamResponse()

  // --- 关键修正：使用重命名后的变量 stepPerformance ---
  if (stepPerformance.routerTime) {
    response.headers.set(
      "X-Performance-Router-Time",
      stepPerformance.routerTime.toFixed(2)
    )
  }
  if (stepPerformance.preJudgmentTime) {
    response.headers.set(
      "X-Performance-Prejudgment-Time",
      stepPerformance.preJudgmentTime.toFixed(2)
    )
  }

  console.log(
    `[PERF] Total Agentic Workflow time before streaming: ${(
      performance.now() - workflowStartTime
    ).toFixed(2)}ms`
  )

  return response
}

export async function buildChatContext(req: NextRequest): Promise<ChatContext> {
  const { user, supabase } = await authenticateRoute()
  const {
    projectId,
    messages = [],
    fileSystemSnapshot = [],
  }: {
    projectId: string
    messages: CoreMessage[]
    fileSystemSnapshot: string[]
  } = await req.json()

  if (messages.length === 0) {
    throw new NextResponse(JSON.stringify({ error: "Messages are required" }), {
      status: 400,
    })
  }

  const lastMessage = messages[messages.length - 1]
  if (lastMessage.role === "user" && messages.length > 1) {
    saveMessageInDb(supabase, {
      projectId,
      content: lastMessage.content as string,
      role: "user",
    }).catch(console.error)
  }

  const gitignoreContent = await getFilesForProject(
    supabase,
    projectId,
    user.id
  )
    .then(
      ({ data }) => data?.find((f) => f.path === ".gitignore")?.content || ""
    )
    .catch((e) => {
      console.warn("Could not fetch .gitignore, proceeding without it.", e)
      return ""
    })

  const ig = ignore()
    .add(gitignoreContent)
    .add([".git/", "node_modules", "dist"])
  const filteredFiles = fileSystemSnapshot.filter((file) => !ig.ignores(file))
  const fileContext =
    filteredFiles.length > 0
      ? "File system snapshot:\n" + filteredFiles.join("\n")
      : "The project is currently empty."

  const conversationHistory = messages
    .slice(-6)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n")

  return {
    user,
    supabase,
    projectId,
    messages,
    fileContext,
    conversationHistory,
  }
}
