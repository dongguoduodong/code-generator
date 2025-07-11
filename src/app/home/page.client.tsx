"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginModal } from "@/app/home/components/LoginModal";
import { useAuth } from "@/contexts/AuthContext";
import { Code, Zap, Brain, LogOut } from "lucide-react";
import { Workspace } from "@/app/home/components/Workspace";

const Home = () => {
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

  if (user) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Zap className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-bold">AI Spark</h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-muted-foreground">
                欢迎, {user.email}
              </div>
              <Button onClick={() => signOut()} variant="outline" size="sm">
                <LogOut className="mr-2 h-4 w-4" />
                退出登录
              </Button>
            </div>
          </div>
        </header>
        <main className="container mx-auto px-4 py-8">
          <Workspace />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <div className="flex items-center justify-center space-x-2 mb-6">
            <Zap className="h-12 w-12 text-primary" />
            <h1 className="text-4xl font-bold">AI Spark</h1>
          </div>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            使用自然语言创建完整的项目。AI驱动的代码生成平台，让编程变得简单而直观。
          </p>
          <Button size="lg" onClick={() => setLoginModalOpen(true)}>
            开始使用
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 mb-16">
          <Card>
            <CardHeader>
              <Brain className="h-8 w-8 text-primary mb-2" />
              <CardTitle className="text-lg">AI 代码生成</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                使用自然语言描述功能，AI 自动生成高质量代码
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Code className="h-8 w-8 text-primary mb-2" />
              <CardTitle className="text-lg">实时预览</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                实时查看生成的代码效果，即时调试和优化
              </CardDescription>
            </CardContent>
          </Card>
          {/* Todo */}
          {/* <Card>
            <CardHeader>
              <Database className="h-8 w-8 text-primary mb-2" />
              <CardTitle className="text-lg">Supabase 集成</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                自动集成数据库和后端服务，无需复杂配置
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Zap className="h-8 w-8 text-primary mb-2" />
              <CardTitle className="text-lg">快速部署</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                一键部署到云端，快速分享您的项目成果
              </CardDescription>
            </CardContent>
          </Card> */}
        </div>

        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">准备好开始了吗？</h2>
          <Button size="lg" onClick={() => setLoginModalOpen(true)}>
            立即注册
          </Button>
        </div>
      </div>

      <LoginModal open={loginModalOpen} onOpenChange={setLoginModalOpen} />
    </div>
  );
};

export default Home;
