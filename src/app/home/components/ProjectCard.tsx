import React from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Calendar, ExternalLink, MoreVertical, Trash2 } from "lucide-react";
import { SerialCallback } from "@/hooks/useSerialCallback";

interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface ProjectCardProps {
  project: Project;
  onDelete: SerialCallback<[projectId: string], void, false>;
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

export function ProjectCard({ project, onDelete }: ProjectCardProps) {
  const handleDelete = () => {
    onDelete(project.id);
  };

  return (
    <AlertDialog>
      <Card className="flex flex-col justify-between h-full hover:border-primary/60 transition-colors group">
        <div>
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
            <div className="space-y-1.5">
              <CardTitle className="text-lg font-bold">
                {project.name}
              </CardTitle>
              <CardDescription className="line-clamp-2 h-[40px]">
                {project.description || "暂无项目描述"}
              </CardDescription>
            </div>
            {/* 1. "更多选项" 按钮作为 DropdownMenu 的触发器 */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity data-[state=open]:opacity-100"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {/* 2. "删除" 菜单项作为 AlertDialog 的触发器 */}
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10">
                    <Trash2 className="mr-2 h-4 w-4" />
                    删除项目
                  </DropdownMenuItem>
                </AlertDialogTrigger>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm text-muted-foreground">
              <Calendar className="mr-1.5 h-4 w-4" />
              <span>更新于 {formatDate(project.updated_at)}</span>
            </div>
          </CardContent>
        </div>
        <CardFooter>
          <Button asChild className="w-full">
            <Link href={`/projects/${project.id}`}>
              打开项目
              <ExternalLink className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardFooter>

        {/* 3. AlertDialog 的内容部分保持不变，它会在菜单项被点击时触发 */}
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确定要删除项目吗？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作无法撤销。这将永久删除项目
              <span className="font-bold"> &quot;{project.name}&quot; </span>
              及其所有相关数据。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive/80 text-white text-destructive-foreground hover:bg-destructive/50"
              disabled={onDelete.isBusy()}
            >
              {onDelete.isBusy() ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </Card>
    </AlertDialog>
  );
}
