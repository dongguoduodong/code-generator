import { SupabaseClient } from "@/types/database";

export interface ProjectFile {
  path: string;
  content: string;
}

export async function getFilesForProject(
  supabase: SupabaseClient,
  projectId: string,
  userId: string
) {
  const { data: projectData, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .single();

  if (projectError || !projectData) {
    throw new Error("Project not found or access denied.");
  }

  return supabase
    .from("project_files")
    .select("path, content")
    .eq("project_id", projectId);
}

/** [CREATE] 创建项目文件 */
export async function createFileForProject(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
  file: ProjectFile
) {
  const { data: projectData, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .single();

  if (projectError || !projectData) {
    throw new Error("Project not found or access denied.");
  }

  return supabase.from("project_files").insert({
    project_id: projectId,
    path: file.path,
    content: file.content,
  });
}

export async function updateFileForProject(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
  file: ProjectFile
) {
  const { data: projectData, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .single();

  if (projectError || !projectData) {
    throw new Error("Project not found or access denied.");
  }

  return supabase
    .from("project_files")
    .update({ content: file.content })
    .eq("project_id", projectId)
    .eq("path", file.path);
}

export async function deleteFileForProject(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
  filePath: string
) {
  const { data: projectData, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .single();

  if (projectError || !projectData) {
    throw new Error("Project not found or access denied.");
  }

  return supabase
    .from("project_files")
    .delete()
    .eq("project_id", projectId)
    .eq("path", filePath);
}
export async function fileExistsForProject(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
  filePath: string
) {
  const { data: projectData, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .single();

  if (projectError || !projectData) {
    throw new Error("Project not found or access denied.");
  }

  const { data, error } = await supabase
    .from("project_files")
    .select("path")
    .eq("project_id", projectId)
    .eq("path", filePath)
    .single();

  return { exists: !!data, error };
}
