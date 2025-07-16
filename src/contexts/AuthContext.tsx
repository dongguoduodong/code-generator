"use client";
import React, { createContext, useContext, useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useMemoizedFn } from "ahooks";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGitHub: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: (options?: { silent?: boolean; message?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const signOut = useMemoizedFn(
    async (options?: { silent?: boolean; message?: string }) => {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Error signing out:", error);
        toast.error("退出登录失败", { description: error.message });
      } else {
        if (!options?.silent) {
          toast.info(options?.message || "您已成功退出登录。");
          window.location.href = "/";
        }
      }
      setUser(null);
    }
  );

  useEffect(() => {
    const initializeSession = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          console.error("Supabase getSession error:", error.message);
        }

        setUser(session?.user ?? null);
      } catch (error: unknown) {
        console.error(
          "Failed to initialize session:",
          error instanceof Error ? error.message : ""
        );
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    initializeSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // 处理 GitHub OAuth 回调错误
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      const errorDescription = params.get("error_description");
      if (errorDescription) {
        toast.error("GitHub 登录失败", {
          description: decodeURIComponent(errorDescription),
        });
        window.history.replaceState(null, "", window.location.pathname);
      }
    }

    const handleSessionExpired = () => {
      signOut({
        message: "您的会话已过期或无效，请重新登录。",
      });
    };

    window.addEventListener("auth:session-expired", handleSessionExpired);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("auth:session-expired", handleSessionExpired);
    };
  }, [signOut]);

  const signInWithGitHub = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        scopes: "user:email",
        redirectTo: `${window.location.origin}/`,
      },
    });
    if (error) throw error;
  };

  const signInWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) throw error;
  };

  const value = {
    user,
    loading,
    signInWithGitHub,
    signInWithEmail,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
