import { SupabaseClient } from "@/types/database";
import { ToolCall } from "ai";

interface UpdateMessageData {
  content?: string;
}

export interface Message {
  id: string;
  created_at: string;
  project_id: string;
  content: string;
  role: "user" | "assistant" | "tool";
  tool_calls?: ToolCall<string, Record<string, unknown>>[];
  tool_call_id?: string;
}

export interface SaveMessageData {
  projectId: string;
  content: string;
  role: "user" | "assistant" | "tool";
  tool_calls?: ToolCall<string, Record<string, unknown>>[];
  tool_call_id?: string;
  name?: string;
}

async function verifyMessageOwnership(
  supabase: SupabaseClient,
  messageId: string,
  userId: string
) {
  const { data, error } = await supabase
    .from("messages")
    .select("*, projects(user_id)")
    .eq("id", messageId)
    .single();

  if (error || !data) throw new Error("Message not found.");
  if (data.projects?.user_id !== userId)
    throw new Error("Forbidden: User does not own this message.");

  return data;
}

export async function getMessagesForProject(
  supabase: SupabaseClient,
  projectId: string
) {
  return supabase
    .from("messages")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
}

export async function saveMessageInDb(
  supabase: SupabaseClient,
  {
    projectId,
    content,
    role,
  }: {
    projectId: string;
    content: string;
    role: "user" | "assistant";
  }
) {
  return supabase
    .from("messages")
    .insert({ project_id: projectId, content, role })
    .select()
    .single();
}

/** [UPDATE] 更新一条消息 (校验用户所有权) */
export async function updateMessage(
  supabase: SupabaseClient,
  messageId: string,
  userId: string,
  updates: UpdateMessageData
) {
  await verifyMessageOwnership(supabase, messageId, userId);
  return supabase
    .from("messages")
    .update(updates)
    .eq("id", messageId)
    .select()
    .single();
}

/** [DELETE] 删除一条消息 (校验用户所有权) */
export async function deleteMessage(
  supabase: SupabaseClient,
  messageId: string,
  userId: string
) {
  await verifyMessageOwnership(supabase, messageId, userId);
  return supabase.from("messages").delete().eq("id", messageId);
}
