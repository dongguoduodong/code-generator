import { NextRequest, NextResponse } from "next/server";
import {
  getFilesForProject,
  createFileForProject,
  updateFileForProject,
  deleteFileForProject,
  type ProjectFile,
  fileExistsForProject,
} from "@/lib/db/file";
import { authenticateRoute } from "@/lib/api/auth";

enum FileOperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
}

export async function GET(req: NextRequest) {
  try {
    const { user, supabase } = await authenticateRoute();

    const url = new URL(req.url);
    if (!user) return new NextResponse("Unauthorized", { status: 401 });
    const { data, error } = await getFilesForProject(
      supabase,
      url.searchParams.get("project_id") || '',
      user.id
    );
    if (error) throw error;

    return NextResponse.json(data);
  } catch (e: unknown) {
    return new NextResponse(e instanceof Error ? e.message : "", {
      status: 500,
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, supabase } = await authenticateRoute();

    const { operations, projectId} = await req.json();

    if (!operations || !Array.isArray(operations)) {
      return new NextResponse(
        "Invalid request body, expected { operations: FileOperation[] }",
        { status: 400 }
      );
    }

    for (const op of operations) {
      if (
        !op.type ||
        !op.path ||
        (op.type !== FileOperationType.DELETE && !op.content)
      ) {
        return new NextResponse("Invalid operation format", { status: 400 });
      }
    }

    try {
      for (const operation of operations) {
        const validateExist = await fileExistsForProject(
          supabase,
          projectId,
          user.id,
          operation.path
        );
        switch (operation.type) {
          case FileOperationType.CREATE:
            const createFile: ProjectFile = {
              path: operation.path,
              content: operation.content!,
            };

            if (validateExist.exists) {
              const { error: updateError } = await updateFileForProject(
                supabase,
                projectId,
                user.id,
                createFile
              );
              if (updateError) throw updateError;
              continue;
            } else {
              if (validateExist.exists) {
                const { error: createError } = await createFileForProject(
                  supabase,
                  projectId,
                  user.id,
                  createFile
                );
                if (createError) throw createError;
              } else {
                const { error: createError } = await createFileForProject(
                  supabase,
                  projectId,
                  user.id,
                  createFile
                );
                if (createError) throw createError;
              }

              break;
            }

          case FileOperationType.UPDATE:
            const updateFile: ProjectFile = {
              path: operation.path,
              content: operation.content!,
            };
            const { error: updateError } = await updateFileForProject(
              supabase,
              projectId,
              user.id,
              updateFile
            );
            if (updateError) throw updateError;
            break;

          case FileOperationType.DELETE:
            const { error: deleteError } = await deleteFileForProject(
              supabase,
              projectId,
              user.id,
              operation.path
            );
            if (deleteError) throw deleteError;
            break;
        }
      }

      return NextResponse.json(
        { message: "File operations processed successfully" },
        { status: 200 }
      );
    } catch (error: unknown) {
      throw new Error(
        `Failed to process file operations: ${
          error instanceof Error ? error.message : ""
        }`
      );
    }
  } catch (e: unknown) {
    return new NextResponse(e instanceof Error ? e.message : "", {
      status: 500,
    });
  }
}
