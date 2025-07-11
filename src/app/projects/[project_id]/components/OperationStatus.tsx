"use client";

import { cn } from "@/lib/utils";
import { CheckCircle2, Loader2, XCircle, CircleDotDashed } from "lucide-react";

interface OperationStatusProps {
  status: "pending" | "executing" | "completed" | "error" | undefined;
  className?: string;
}

export default function OperationStatus({
  status,
  className,
}: OperationStatusProps) {
  switch (status) {
    case "executing":
      return (
        <Loader2
          className={cn("size-4 animate-spin text-yellow-400", className)}
          aria-label="正在执行"
        />
      );
    case "completed":
      return (
        <CheckCircle2
          className={cn("size-4 text-green-500", className)}
          aria-label="已完成"
        />
      );
    case "error":
      return (
        <XCircle
          className={cn("size-4 text-red-500", className)}
          aria-label="错误"
        />
      );
    case "pending":
    default:
      return (
        <CircleDotDashed
          className={cn("size-4 text-neutral-500", className)}
          aria-label="待处理"
        />
      );
  }
}
