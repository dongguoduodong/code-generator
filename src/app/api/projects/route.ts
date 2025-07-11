import { NextRequest, NextResponse } from "next/server";
import { getProjects, createProjectInDb } from "@/lib/db/project";
import { saveMessageInDb } from "@/lib/db/message";
import { generateObject } from "ai";
import { z } from "zod";
import { customOpenai } from "@/lib/openai";
import { authenticateRoute } from "@/lib/api/auth";

export const GET = async () => {
  const { user, supabase } = await authenticateRoute();

  const { data: projects, error } = await getProjects(supabase, user.id);

  if (error) {
    console.error("Error fetching projects:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }

  return NextResponse.json(projects);
};

export const POST = async (req: NextRequest) => {
  const { user, supabase } = await authenticateRoute();

  const { prompt } = await req.json();
  if (!prompt) {
    return new NextResponse("Prompt is required", { status: 400 });
  }

  try {
    const { object: metadata } = await generateObject({
      model: customOpenai("gemini-2.5-flash-preview-05-20"),
      schema: z.object({
        title: z.string().describe("A short, catchy title for the project."),
        description: z
          .string()
          .describe("A one-sentence summary of the project."),
      }),
      prompt: `Based on the user's idea: "${prompt}", generate a concise project title and a one-sentence description.`,
    });

    const { data: newProject, error: projectError } = await createProjectInDb(
      supabase,
      {
        title: metadata.title,
        description: metadata.description,
        userId: user.id,
      }
    );

    if (projectError) {
      throw projectError;
    }

    await saveMessageInDb(supabase, {
      projectId: newProject.id,
      content: prompt,
      role: "user",
    });

    return NextResponse.json(newProject, { status: 201 });
  } catch (error: unknown) {
    console.error("Error creating project:", error);
    return new NextResponse(
      error instanceof Error ? error.message : "Internal Server Error",
      {
        status: 500,
      }
    );
  }
};
