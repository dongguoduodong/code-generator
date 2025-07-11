import { streamText, generateObject, CoreMessage } from "ai";
import { saveMessageInDb } from "@/lib/db/message";
import { customOpenai } from "@/lib/openai";
import { NextResponse, NextRequest } from "next/server";
import { ROUTER_PROMPT, PLANNER_PROMPT, CODER_PROMPT } from "@/lib/prompts";
import { RouterDecisionSchema, type RouterDecision } from "@/lib/schemas";
import ignore from "ignore";
import { getFilesForProject } from "@/lib/db/file";
import { authenticateRoute } from "@/lib/api/auth"; // 导入新的认证函数

export const maxDuration = 120;

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
    const userMessagesCount = messages.filter((m) => m.role === "user").length;
    const assistantMessagesCount = messages.filter(
      (m) => m.role === "assistant"
    ).length;

    if (
      lastMessage.role === "user" &&
      messages.length > 1 &&
      userMessagesCount > assistantMessagesCount
    ) {
      await saveMessageInDb(supabase, {
        projectId,
        content: lastMessage.content as string,
        role: "user",
      });
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
        gitignoreContent = gitignoreFileContent.content;
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

    const routerSystemPrompt = ROUTER_PROMPT.replace(
      "{conversation_history}",
      conversationHistory
    ).replace("{file_system_snapshot}", fileContext);

    const { object: routerDecision } = await generateObject<RouterDecision>({
      model: customOpenai("gemini-2.5-flash-preview-05-20"),
      system: routerSystemPrompt,
      prompt: `User's latest message: "${lastMessage.content}"`,
      schema: RouterDecisionSchema,
    });

    let finalResponseStream;
    if (routerDecision.decision === "PLAN") {
      finalResponseStream = await streamText({
        model: customOpenai("gemini-2.5-pro"),
        system: PLANNER_PROMPT,
        prompt: routerDecision.next_prompt_input,
        async onFinish(result) {
          await saveMessageInDb(supabase, {
            projectId,
            content: result.text,
            role: "assistant",
          });
        },
      });
    } else {
      finalResponseStream = await streamText({
        model: customOpenai("gemini-2.5-pro"),
        system: CODER_PROMPT,
        prompt: routerDecision.next_prompt_input,
        async onFinish(result) {
          await saveMessageInDb(supabase, {
            projectId,
            content: result.text,
            role: "assistant",
          });
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
