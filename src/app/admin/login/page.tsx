import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  hasAdminPageSession,
  isAdminAuthConfigured,
} from "@/features/admin/admin-auth";
import { AdminLoginForm } from "@/features/admin/components/admin-login-form";

export const metadata: Metadata = {
  title: "Вход в редакцию",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  if (await hasAdminPageSession()) {
    redirect("/admin");
  }

  return (
    <main className="admin-login-shell">
      <AdminLoginForm configured={isAdminAuthConfigured()} />
    </main>
  );
}
