import { streamText, generateObject, CoreMessage } from "ai";
import { saveMessageInDb } from "@/lib/db/message";
import { customOpenai } from "@/lib/openai";
import { NextResponse, NextRequest } from "next/server";
import { ROUTER_PROMPT, PLANNER_PROMPT, CODER_PROMPT } from "@/lib/prompts";
import { RouterDecisionSchema, type RouterDecision } from "@/lib/schemas";
import ignore from "ignore";
import { getFilesForProject } from "@/lib/db/file";
import { authenticateRoute } from "@/lib/api/auth";

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
      previousMessage.content.trim().endsWith("?") // 简单的计划检测
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

    if (lastMessage.role === "user") {
      saveMessageInDb(supabase, {
        projectId,
        content: lastMessage.content as string,
        role: "user",
      }).catch(console.error); // 在后台执行，不阻塞请求
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

    let routerDecision: RouterDecision;
    const fastPathDecision = preJudgmentRouter(messages);

    if (fastPathDecision) {
      // 快速通道：使用本地预判断的决策
      console.log("Fast-path decision made:", fastPathDecision.decision);
      routerDecision = {
        reason: "Pre-judged for performance.",
        ...fastPathDecision,
      };
    } else {
      // 通用路径：回退到 Router Agent 进行决策
      console.log("Falling back to Router Agent...");
      const routerSystemPrompt = ROUTER_PROMPT.replace(
        "{conversation_history}",
        conversationHistory
      ).replace("{file_system_snapshot}", fileContext);

      const { object } = await generateObject<RouterDecision>({
        model: customOpenai("gemini-2.5-flash-preview-05-20"),
        system: routerSystemPrompt,
        prompt: `User's latest message: "${lastMessage.content}"`,
        schema: RouterDecisionSchema,
      });
      routerDecision = object;
    }

    let finalResponseStream;
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

    return finalResponseStream.toDataStreamResponse();
  } catch (error: unknown) {
    if (error instanceof Response) {
      return error;
    }
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
