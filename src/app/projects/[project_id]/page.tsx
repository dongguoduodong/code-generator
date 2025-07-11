import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { getProjectById } from "@/lib/db/project";
import { getMessagesForProject } from "@/lib/db/message";
import { getFilesForProject } from "@/lib/db/file";
import ProjectClientPage from "./page.client";

interface ProjectPageProps {
  params: Promise<{ project_id: string }>;
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { project_id } = await params;

  if (!user) {
    redirect("/");
  }

  const { data: project, error: projectError } = await getProjectById(
    supabase,
    project_id,
    user.id
  );

  if (projectError || !project) {
    notFound();
  }

  const { data: messages, error: messagesError } = await getMessagesForProject(
    supabase,
    project.id
  );
  if (messagesError) {
    throw new Error("Failed to fetch project messages.");
  }

  const { data: files, error: filesError } = await getFilesForProject(
    supabase,
    project.id,
    user.id
  );
  if (filesError) {
    throw new Error("Failed to fetch project files.");
  }

  const gitignoreFile = files?.find((file) => file.path === ".gitignore");
  const initialGitignoreContent = gitignoreFile?.content || "";

  const hasAssistantMessage = messages.some(
    (message) => message.role === "assistant"
  );
  const isFirstLoad = !hasAssistantMessage;
  return (
    <ProjectClientPage
      project={project}
      initialMessages={messages || []}
      initialFiles={files || []}
      isFirstLoad={isFirstLoad}
      initialGitignoreContent={initialGitignoreContent}
    />
  );
}
