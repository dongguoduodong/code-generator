import { AuthProvider } from "@/contexts/AuthContext";
import Home from "./home/page.client";
import { Toaster } from "sonner";

export default async function Page() {
  return (
    <AuthProvider>
      <Toaster position="top-center" />
      <Home />
    </AuthProvider>
  );
}
