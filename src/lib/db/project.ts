import { SupabaseClient } from "@/types/database";

interface CreateProjectData {
  title: string;
  description: string;
  userId: string;
}

interface UpdateProjectData {
  name?: string;
  description?: string;
}

export async function getProjects(supabase: SupabaseClient, userId: string) {
  return supabase
    .from("projects")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
}

export async function getProjectById(
  supabase: SupabaseClient,
  projectId: string,
  userId: string
) {
  return supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", userId)
    .single();
}

export async function createProjectInDb(
  supabase: SupabaseClient,
  { title, description, userId }: CreateProjectData
) {
  return supabase
    .from("projects")
    .insert({ name: title, description: description, user_id: userId })
    .select()
    .single();
}

export async function updateProject(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
  updates: UpdateProjectData
) {
  return supabase
    .from("projects")
    .update(updates)
    .eq("id", projectId)
    .eq("user_id", userId)
    .select()
    .single();
}

export async function deleteProject(
  supabase: SupabaseClient,
  projectId: string,
  userId: string
) {
  return supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("user_id", userId);
}
