import React, { useEffect, useState } from "react";
import { redirect, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProjectCard } from "./ProjectCard";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase/client";
import { Loader2Icon, Search, SendHorizonal } from "lucide-react";
import { toast } from "sonner";
import { useSerialCallback } from "@/hooks/useSerialCallback";
import { Textarea } from "../../../components/ui/textarea";
import { getProjects } from "@/lib/db/project";
import { apiClient } from "@/lib/apiClient";

interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export function Workspace() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const { user } = useAuth();
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    if (user) {
      fetchProjects();
    }
  }, [user]);

  const fetchProjects = useSerialCallback(async () => {
    try {
      if (!user) {
        redirect("/");
      }
      const { data, error } = await getProjects(supabase, user.id);

      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error("Error fetching projects:", error);
      toast.error("加载失败", { description: "无法加载项目列表" });
    }
  });

  const handleGenerateProject = useSerialCallback(
    async () => {
      const trimmedPrompt = prompt.trim();
      if (!trimmedPrompt) return;

      if (!trimmedPrompt) return;
      const toastId = toast.loading("正在为您创建新项目，请稍候...");
      try {
        const response = await apiClient("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: trimmedPrompt }),
        });

        if (!response.ok) {
          const errorData = await response
            .json()
            .catch((err) => (err ? err : { message: "项目创建请求失败" }));
          throw new Error(errorData.message || "项目创建请求失败");
        }

        const newProject = await response.json();

        toast.success(`项目 "${newProject.name}" 创建成功!`, {
          id: toastId,
          description: "正在加载工作区，这可能需要一些时间...",
        });

        router.push(`/projects/${newProject.id}`);
      } catch (error: unknown) {
        console.error("Error creating project via AI:", error);
        toast.error("项目创建失败", {
          id: toastId,
          description:
            error instanceof Error
              ? error.message
              : "请检查控制台获取更多信息。",
        });
      }
    },
    {
      triggerReRenderOnBusyStatusChange: false,
    }
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleGenerateProject();
    }
  };
  const deleteProject = useSerialCallback(async (projectId: string) => {
    try {
      const { error } = await supabase
        .from("projects")
        .delete()
        .eq("id", projectId);

      if (error) throw error;

      setProjects((currentProjects) =>
        currentProjects.filter((p) => p.id !== projectId)
      );

      toast.success("项目已删除");
    } catch (error) {
      console.error("Error deleting project:", error);
      toast.error("删除失败", {
        description: "无法删除该项目，请稍后再试",
      });
    }
  });

  const filteredProjects = projects.filter(
    (project) =>
      project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (project.description &&
        project.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (fetchProjects.isBusy()) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">加载项目中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Label htmlFor="prompt" className="text-base font-medium">
          描述您的项目想法
        </Label>
        <div className="relative">
          <Textarea
            id="prompt"
            placeholder="例如：创建一个在线任务管理应用，用户可以添加、编辑和删除任务，支持标签分类和优先级设置..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-[120px] resize-none pr-20 py-3"
            disabled={handleGenerateProject.isBusy()}
          />
          <Button
            size="icon"
            className="absolute right-3 bottom-3"
            onClick={handleGenerateProject}
            disabled={handleGenerateProject.isBusy() || !prompt.trim()}
            aria-label="生成项目"
          >
            {handleGenerateProject.isBusy() ? (
              <Loader2Icon className="h-5 w-5 animate-spin" />
            ) : (
              <SendHorizonal className="h-5 w-5" />
            )}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          请详细描述您想要的功能，AI将为您生成完整的项目。按 Enter 发送。
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">我的项目</h2>
          <p className="text-muted-foreground">管理和创建你的AI项目</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="搜索项目..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {filteredProjects.length === 0 ? (
        <div className="text-center py-12">{/* ...空状态UI保持不变... */}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onDelete={deleteProject}
            />
          ))}
        </div>
      )}
    </div>
  );
}
