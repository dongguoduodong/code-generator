import { streamText, generateObject, CoreMessage } from "ai";
import { saveMessageInDb } from "@/lib/db/message";
import { customOpenai } from "@/lib/openai";
import { NextResponse, NextRequest } from "next/server";
import {
  ROUTER_PROMPT,
  PLANNER_PROMPT,
  CODER_PROMPT,
  E2E_PROMPT,
  CUSTOMIZER_PROMPT,
} from "@/lib/prompts";
import { RouterDecisionSchema, type RouterDecision } from "@/lib/schemas";
import ignore from "ignore";
import { getFilesForProject } from "@/lib/db/file";
import { authenticateRoute } from "@/lib/api/auth";
import { getTemplateById } from "@/lib/templates";

export const maxDuration = 120;

// "预判断" 逻辑层

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
  "执行",
]);

/**
 * 快速通道决策函数，用于处理高确定性的请求，避免不必要的AI调用。
 * @param messages 对话历史
 * @returns 如果匹配快速通道，则返回决策；否则返回 null。
 */
function preJudgmentRouter(
  messages: CoreMessage[]
): { decision: "PLAN" | "CODE"; next_prompt_input: string } | null {
  if (messages.length === 0) return null;

  const lastUserMessage = messages[messages.length - 1];
  if (
    lastUserMessage.role !== "user" ||
    typeof lastUserMessage.content !== "string"
  ) {
    return null;
  }

  const userContent = lastUserMessage.content.trim().toLowerCase();

  // 场景一: 系统错误处理
  if (userContent.startsWith("[system_error]")) {
    return {
      decision: "PLAN",
      next_prompt_input: lastUserMessage.content,
    };
  }

  // 场景二: 计划批准
  if (messages.length > 1) {
    const previousMessage = messages[messages.length - 2];
    const isConfirmation = POSITIVE_CONFIRMATIONS.has(
      userContent.replace(/[.!?]/g, "")
    );
    if (
      isConfirmation &&
      previousMessage.role === "assistant" &&
      typeof previousMessage.content === "string" &&
      (previousMessage.content.trim().endsWith("?") ||
        previousMessage.content.trim().endsWith("？")) // 简单的计划检测
    ) {
      return {
        decision: "CODE",
        next_prompt_input: previousMessage.content, // 使用被批准的计划作为输入
      };
    }
  }

  return null; // 未匹配任何快速通道模式
}

export async function POST(req: NextRequest) {
  try {
    const { user, supabase } = await authenticateRoute();

    const {
      projectId,
      messages = [],
      fileSystemSnapshot = [],
    }: {
      projectId: string;
      messages: CoreMessage[];
      fileSystemSnapshot: string[];
    } = await req.json();

    if (messages.length === 0) {
      return NextResponse.json(
        { error: "Messages are required" },
        { status: 400 }
      );
    }

    const lastMessage = messages[messages.length - 1];

    if (lastMessage.role === "user" && messages.length > 1) {
      saveMessageInDb(supabase, {
        projectId,
        content: lastMessage.content as string,
        role: "user",
      }).catch(console.error);
    }

    let gitignoreContent = "";
    try {
      const { data: gitignoreFile } = await getFilesForProject(
        supabase,
        projectId,
        user.id
      );
      const gitignoreFileContent = gitignoreFile?.find(
        (f) => f.path === ".gitignore"
      );
      if (gitignoreFileContent) {
        gitignoreContent = gitignoreFileContent.content || "";
      }
    } catch (e) {
      console.warn("Could not fetch .gitignore, proceeding without it.", e);
    }

    const ig = ignore()
      .add(gitignoreContent)
      .add([".git/", "node_modules", "dist"]);
    const filteredFiles = fileSystemSnapshot.filter(
      (file) => !ig.ignores(file)
    );
    const fileContext =
      filteredFiles.length > 0
        ? "File system snapshot:\n" + filteredFiles.join("\n")
        : "The project is currently empty.";

    const conversationHistory = messages
      .slice(-6)
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    const architecture = process.env.NEXT_PUBLIC_AI_ARCHITECTURE || "TRI_AGENT";
    let finalResponseStream;

    // --- 性能测量点 ---
    let t_preJudgment: number | null = null;
    let t_router: number | null = null;

    if (architecture === "END_TO_END") {
      // --- 端到端模型路径 ---
      console.log("Executing with End-to-End Model...");

      const systemPrompt = E2E_PROMPT.replace(
        "{conversation_history}",
        conversationHistory
      ).replace("{file_system_snapshot}", fileContext);

      finalResponseStream = await streamText({
        model: customOpenai("gemini-2.5-pro"),
        system: systemPrompt,
        prompt: `User's latest request: "${lastMessage.content}"`,
        async onFinish(result) {
          saveMessageInDb(supabase, {
            projectId,
            content: result.text,
            role: "assistant",
          }).catch(console.error);
        },
      });
    } else {
      let routerDecision: RouterDecision;
      const preJudgmentStartTime = performance.now();
      const fastPathDecision = preJudgmentRouter(messages);
      if (fastPathDecision) {
        routerDecision = {
          reason: "Pre-judged for performance.",
          ...fastPathDecision,
        };
        t_preJudgment = performance.now() - preJudgmentStartTime;
      } else {
        // 通用路径：回退到 Router Agent 进行决策
        const routerSystemPrompt = ROUTER_PROMPT.replace(
          "{conversation_history}",
          conversationHistory
        ).replace("{file_system_snapshot}", fileContext);
        const routerStartTime = performance.now();
        const { object } = await generateObject<RouterDecision>({
          model: customOpenai("gemini-2.5-flash-preview-05-20"),
          system: routerSystemPrompt,
          prompt: `User's latest message: "${lastMessage.content}"`,
          schema: RouterDecisionSchema,
        });
        t_router = performance.now() - routerStartTime;

        routerDecision = object;
      }
      if (routerDecision.templateId) {
        const template = getTemplateById(routerDecision.templateId);

        if (template) {
          const encoder = new TextEncoder();
          let fullPlanForDb = ""; // 用于最后保存到数据库

          const readableStream = new ReadableStream({
            async start(controller) {
              const push = (chunk: string) => {
                fullPlanForDb += chunk;
                controller.enqueue(
                  encoder.encode(`0:"${JSON.stringify(chunk).slice(1, -1)}"\n`)
                );
              };

              // --- 第 1 阶段: 瞬时发送静态模板头部 ---
              const initialGreeting = "好的，这是为您定制的计划：\n\n";
              push(initialGreeting);

              let stepCounter = 1;
              for (const step of template.planBody) {
                const numberedStep = `${stepCounter}. ${step}\n`;
                push(numberedStep);
                stepCounter++;
                // 短暂延迟以确保分块发送，增强流式效果
                await new Promise((res) => setTimeout(res, 5));
              }

              // --- 第 2 阶段: 调用 AI 动态生成并流式传输定制化步骤 ---
              if (routerDecision.customInstructions) {
                try {
                  const customizerPrompt = CUSTOMIZER_PROMPT.replace(
                    "{base_plan}",
                    template.planBody.join("\n")
                  ).replace(
                    "{custom_instructions}",
                    routerDecision.customInstructions
                  );

                  const modifierResult = await streamText({
                    model: customOpenai("gemini-2.5-pro"),
                    prompt: customizerPrompt,
                  });

                  let lineBuffer = "";
                  for await (const delta of modifierResult.textStream) {
                    lineBuffer += delta;
                    const lines = lineBuffer.split("\n");

                    // 保留最后可能不完整的一行
                    lineBuffer = lines.pop() || "";

                    for (const line of lines) {
                      if (line.startsWith("- ")) {
                        const numberedStep = `\n${stepCounter}. ${line.substring(
                          2
                        )}`;
                        push(numberedStep);
                        stepCounter++;
                      } else if (line.trim()) {
                        push(` ${line}`);
                      }
                    }
                  }
                  // 处理缓冲区中剩余的最后一行
                  if (lineBuffer.startsWith("- ")) {
                    const numberedStep = `\n${stepCounter}. ${lineBuffer.substring(
                      2
                    )}`;
                    push(numberedStep);
                    stepCounter++;
                  }
                } catch (e) {
                  console.error("Customizer Agent failed:", e);
                  const errorMsg =
                    "\n[系统] 抱歉，在生成自定义步骤时遇到错误。\n";
                  push(errorMsg);
                }
              }

              // --- 第 3 阶段: 瞬时发送静态模板尾部 ---
              push("\n\n");

              for (const step of template.planExecutionSteps) {
                const pm = routerDecision.packageManager || "npm";
                const commands = {
                  npm: { install: "npm install", runDev: "npm run dev" },
                  pnpm: { install: "pnpm install", runDev: "pnpm dev" },
                  yarn: { install: "yarn", runDev: "yarn dev" },
                };
                const parameterizedStep = step
                  .replace("{{PM_INSTALL}}", commands[pm].install)
                  .replace("{{PM_RUN_DEV}}", commands[pm].runDev);
                const numberedStep = `${stepCounter}. ${parameterizedStep}\n`;
                push(numberedStep);
                stepCounter++;
                await new Promise((res) => setTimeout(res, 5));
              }

              push(template.planConclusion);

              // --- 第 4 阶段: 保存完整消息并关闭流 ---
              saveMessageInDb(supabase, {
                projectId,
                content: fullPlanForDb.trim(),
                role: "assistant",
              }).catch(console.error);

              controller.close();
            },
          });

          const response = new Response(readableStream, {
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
          if (t_router)
            response.headers.set(
              "X-Performance-Router-Time",
              t_router.toFixed(2)
            );
          if (t_preJudgment)
            response.headers.set(
              "X-Performance-Prejudgment-Time",
              t_preJudgment.toFixed(2)
            );
          return response;
        } else {
          console.warn(
            `Router returned invalid templateId: ${routerDecision.templateId}`
          );
          // 如果模板ID无效，则降级到标准Planner流程
        }
      }

      if (routerDecision.decision === "PLAN") {
        finalResponseStream = await streamText({
          model: customOpenai("gemini-2.5-pro"),
          system: PLANNER_PROMPT,
          prompt: routerDecision.next_prompt_input,
          async onFinish(result) {
            saveMessageInDb(supabase, {
              projectId,
              content: result.text,
              role: "assistant",
            }).catch(console.error);
          },
        });
      } else {
        finalResponseStream = await streamText({
          model: customOpenai("gemini-2.5-pro"),
          system: CODER_PROMPT,
          prompt: routerDecision.next_prompt_input,
          async onFinish(result) {
            saveMessageInDb(supabase, {
              projectId,
              content: result.text,
              role: "assistant",
            }).catch(console.error);
          },
        });
      }
    }
    const response = finalResponseStream.toDataStreamResponse();
    if (t_router)
      response.headers.set("X-Performance-Router-Time", t_router.toFixed(2));
    if (t_preJudgment)
      response.headers.set(
        "X-Performance-Prejudgment-Time",
        t_preJudgment.toFixed(2)
      );

    return response;
  } catch (error: unknown) {
    if (error instanceof Response) {
      return error;
    }
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
