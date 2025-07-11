import { NextRequest, NextResponse } from "next/server";
import { getProjectById, updateProject, deleteProject } from "@/lib/db/project";
import { authenticateRoute } from "@/lib/api/auth";

export const GET = async (req: NextRequest) => {
  const { user, supabase } = await authenticateRoute();
  const url = new URL(req.url);

  const projectId = url.searchParams.get("project_id") || '';
  const { data: project, error } = await getProjectById(
    supabase,
    projectId,
    user.id
  );

  if (error) {
    return new NextResponse(error.message, { status: 404 });
  }

  return NextResponse.json(project);
};

export const POST = async (req: NextRequest) => {
  const { projectId, ...others } = await req.json();
  const { user, supabase } = await authenticateRoute();

  const { data: updatedProject, error } = await updateProject(
    supabase,
    projectId,
    user.id,
    others
  );

  if (error) {
    return new NextResponse(error.message, { status: 404 });
  }

  return NextResponse.json(updatedProject);
};

export const DELETE = async (req: NextRequest) => {
  const { user, supabase } = await authenticateRoute();
  const { projectId } = await req.json();

  const { error } = await deleteProject(supabase, projectId, user.id);

  if (error) {
    return new NextResponse(error.message, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
};
