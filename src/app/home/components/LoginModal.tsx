"use client";
import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { Mail } from "lucide-react";
import { SiGithub } from "react-icons/si";
import { toast } from "sonner";
import { AuthError } from "@supabase/supabase-js";
interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LoginModal({ open, onOpenChange }: LoginModalProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { signInWithGitHub, signInWithEmail, signUp } = useAuth();

  const handleGitHubSignIn = async () => {
    try {
      setLoading(true);
      await signInWithGitHub();
    } catch (error: unknown) {
      console.error("GitHub 登录初始化失败:", error);
      toast.error("登录失败", {
        description: "GitHub登录过程中出现错误",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      if (isSignUp) {
        await signUp(email, password);
        toast.success("注册成功！请检查您的邮箱以验证账户。");
        setIsSignUp(false);
      } else {
        await signInWithEmail(email, password);
        toast.success("登录成功！");
      }
      onOpenChange(false);
    } catch (error: unknown) {
      let message = "";
      if (error instanceof AuthError) {
        switch (error.message) {
          case "Invalid login credentials":
            message = "邮箱或密码不正确，请重试。";
            break;
          case "Email rate limit exceeded":
            message = "尝试次数过多，请稍后再试。";
            break;
          case "Email not confirmed":
            message = "您的邮箱尚未验证，请检查您的邮箱并完成验证。";
          default:
            message = `登录失败: ${error.message}`;
        }
      } else {
        message = "发生未知错误，请检查您的网络连接。";
      }
      toast.error(isSignUp ? "注册失败" : "登录失败", {
        description: message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isSignUp ? "注册账户" : "登录到 Code Generator"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Button
            onClick={handleGitHubSignIn}
            disabled={loading}
            className="w-full"
            variant="outline"
          >
            <SiGithub className="mr-2 h-4 w-4" />
            使用 GitHub 登录
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                或者
              </span>
            </div>
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                value={password}
                minLength={6}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              <Mail className="mr-2 h-4 w-4" />
              {isSignUp ? "注册" : "登录"}
            </Button>
          </form>

          <div className="text-center text-sm">
            {isSignUp ? "已有账户？" : "没有账户？"}
            <Button
              variant="link"
              onClick={() => setIsSignUp(!isSignUp)}
              className="p-0 ml-1"
            >
              {isSignUp ? "立即登录" : "立即注册"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
