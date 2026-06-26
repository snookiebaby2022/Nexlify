import { headers } from "next/headers";
import { LoginForm } from "@/components/login-form";
import { isPanelDemoHost } from "@/lib/panel-demo-host";

export default async function LoginPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";

  return <LoginForm showDemoLogins={isPanelDemoHost(host)} />;
}
