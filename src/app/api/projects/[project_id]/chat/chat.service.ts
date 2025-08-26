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
    return { decision: fastPathDecision, performance: metrics }
  }

  const routerSystemPrompt = ROUTER_PROMPT.replace(
    "{conversation_history}",
    conversationHistory
  ).replace("{file_system_snapshot}", fileContext)

  const routerStartTime = performance.now()
  const { object: decision } = await generateObject<RouterDecision>({
    model: customOpenai("gemini-2.5-flash-preview-05-20"),
    system: routerSystemPrompt,
    prompt: `User's latest message: "${messages[messages.length - 1].content}"`,
    schema: RouterDecisionSchema,
  })

  metrics.routerTime = performance.now() - routerStartTime

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

const streamTextChunk = (
  text: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder
): void => {
  if (!text) return
  // 遵循 Vercel AI SDK 的流格式: 0:"<json_escaped_string_chunk>"\n
  const formattedChunk = `0:"${JSON.stringify(text).slice(1, -1)}"\n`
  controller.enqueue(encoder.encode(formattedChunk))
}
/**
 * 根据模板ID生成一个复合流式响应。
 * 该响应结合了静态模板内容和动态AI生成内容。
 * @param context - 聊天上下文
 * @param routerDecision - 路由决策
 * @returns 一个 Response 对象
 */
export function createTemplateStreamResponse(
  context: ChatContext,
  routerDecision: RouterDecision
): Response {
  const template = getTemplateById(routerDecision.templateId!)
  if (!template) {
    return new NextResponse(
      `错误: 未找到 ID 为 '${routerDecision.templateId}' 的模板。`,
      { status: 500 }
    )
  }

  const encoder = new TextEncoder()

  const readableStream = new ReadableStream<Uint8Array>({
    async start(controller: ReadableStreamDefaultController<Uint8Array>) {
      // 用于最终保存到数据库的完整消息内容
      let fullPlanForDb = ""

      /**
       * 包装函数：将文本累加到 fullPlanForDb 并以打字机效果流式传输
       * @param text 要处理的文本
       */
      const streamAndAccumulate = async (text: string): Promise<void> => {
        fullPlanForDb += text
        streamTextChunk(text, controller, encoder)
      }

      let stepCounter = 1

      try {
        // 阶段1: 发送模板头部
        streamAndAccumulate("好的，这是为您定制的计划：\n\n")
        for (const step of template.planBody) {
          streamAndAccumulate(`${stepCounter++}. ${step}\n`)
        }

        // 阶段2: AI动态生成定制化步骤
        if (routerDecision.customInstructions) {
          try {
            const customizerPrompt = CUSTOMIZER_PROMPT.replace(
              "{base_plan}",
              template.planBody.join("\n")
            ).replace(
              "{custom_instructions}",
              routerDecision.customInstructions
            )

            const modifierResult = await streamText({
              model: customOpenai("gemini-2.5-pro"),
              prompt: customizerPrompt,
            })

            // 逐 token 处理 AI 的流式响应，以获得最佳流畅度
            for await (const delta of modifierResult.textStream) {
              streamAndAccumulate(delta)
            }
          } catch (e: unknown) {
            console.error("Customizer Agent 失败:", e)
            const errorMessage = e instanceof Error ? e.message : String(e)
            await streamAndAccumulate(
              `\n[系统] 抱歉，在生成自定义步骤时遇到错误: ${errorMessage}\n`
            )
          }
        }

        // 阶段3: 发送模板尾部
        await streamAndAccumulate("\n\n")
        const pm = routerDecision.packageManager || "npm"
        const commands = {
          npm: { install: "npm install", runDev: "npm run dev" },
          pnpm: { install: "pnpm install", runDev: "pnpm dev" },
          yarn: { install: "yarn", runDev: "yarn dev" },
        }
        for (const step of template.planExecutionSteps) {
          const parameterizedStep = step
            .replace("{{PM_INSTALL}}", commands[pm].install)
            .replace("{{PM_RUN_DEV}}", commands[pm].runDev)
          await streamAndAccumulate(`${stepCounter++}. ${parameterizedStep}\n`)
        }

        await streamAndAccumulate(template.planConclusion)
      } catch (error) {
        // 捕获流处理过程中的任何意外错误
        console.error("创建模板流时发生严重错误:", error)
        // 尝试向客户端发送一条错误信息
        try {
          await streamAndAccumulate(
            "\n\n[系统] 抱歉，生成响应时发生意外错误，请重试。"
          )
        } catch (e) {
          console.error("无法向客户端发送流错误信息:", e)
        }
      } finally {
        // 阶段4: 保存完整消息并关闭流
        saveMessageInDb(context.supabase, {
          projectId: context.projectId,
          content: fullPlanForDb.trim(),
          role: "assistant",
        }).catch(console.error)

        controller.close()
      }
    },
  })

  return new Response(readableStream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
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

/**
 * 执行多智能体（Agentic）工作流。
 * @param context - 聊天上下文
 * @returns 一个 Response 对象
 */
export async function executeAgenticWorkflow(
  context: ChatContext
): Promise<Response> {
  const { decision, performance } = await determineNextStep(context)
  console.log("Router Decision:", decision)
  let response: Response

  if (decision.templateId) {
    response = createTemplateStreamResponse(context, decision)
  } else {
    let streamResult: StreamTextResult<never, never> | null = null
    const model = customOpenai("gemini-2.5-pro")
    const systemPrompt =
      decision.decision === "PLAN" ? PLANNER_PROMPT : CODER_PROMPT
    streamResult = await createAiStream(
      context,
      model,
      systemPrompt,
      decision.next_prompt_input
    )
    response = streamResult.toDataStreamResponse()
  }

  if (performance.routerTime) {
    response.headers.set(
      "X-Performance-Router-Time",
      performance.routerTime.toFixed(2)
    )
  }
  if (performance.preJudgmentTime) {
    response.headers.set(
      "X-Performance-Prejudgment-Time",
      performance.preJudgmentTime.toFixed(2)
    )
  }

  return response
}

/**
 * 从请求中构建聊天上下文对象。
 * @param req - NextRequest
 * @returns 聊天上下文
 */
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

  // 异步保存用户消息 (仅在非首次消息时)
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
