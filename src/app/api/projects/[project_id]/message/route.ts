import { NextRequest, NextResponse } from "next/server";
import { saveMessageInDb } from "@/lib/db/message";
import { getProjectById } from "@/lib/db/project";
import { authenticateRoute } from "@/lib/api/auth";

export async function POST(req: NextRequest) {
  try {
    const { user, supabase } = await authenticateRoute();
    const { content, role, projectId: projectId } = await req.json();

    if (!content || !role) {
      return new NextResponse("Missing required fields: content and role", {
        status: 400,
      });
    }

    if (role !== "user" && role !== "assistant") {
      return new NextResponse("Invalid role specified", { status: 400 });
    }

    const { error: projectError } = await getProjectById(
      supabase,
      projectId,
      user.id
    );

    if (projectError) {
      return new NextResponse("Project not found or access denied", {
        status: 404,
      });
    }

    const { data: newMessage, error: messageError } = await saveMessageInDb(
      supabase,
      {
        projectId,
        content,
        role,
      }
    );

    if (messageError) {
      throw new Error(messageError.message);
    }

    return NextResponse.json(newMessage, { status: 201 });
  } catch (error) {
    console.error("[MESSAGES_POST_ERROR]", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal Server Error";
    return new NextResponse(errorMessage, { status: 500 });
  }
}
