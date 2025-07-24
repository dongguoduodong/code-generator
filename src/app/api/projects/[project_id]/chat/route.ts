import { NextResponse, type NextRequest } from "next/server";
import {
  buildChatContext,
  executeAgenticWorkflow,
  executeEndToEndWorkflow,
} from "./chat.service";

export const maxDuration = 120;

enum AiArchitecture {
  END_TO_END = "END_TO_END",
  TRI_AGENT = "TRI_AGENT",
}

/**
 * API POST Handler
 * 职责:
 * 1. 解析请求
 * 2. 调用核心业务逻辑
 * 3. 处理全局错误并返回响应
 */
export async function POST(req: NextRequest): Promise<Response> {
  try {
    const context = await buildChatContext(req);

    const architecture = (process.env.NEXT_PUBLIC_AI_ARCHITECTURE ||
      "TRI_AGENT") as AiArchitecture;

    if (architecture === AiArchitecture.END_TO_END) {
      return await executeEndToEndWorkflow(context);
    } else {
      return await executeAgenticWorkflow(context);
    }
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    console.error("[CHAT_API_ERROR]", errorMessage);
    return new NextResponse(JSON.stringify({ error: errorMessage }), {
      status: 500,
    });
  }
}
