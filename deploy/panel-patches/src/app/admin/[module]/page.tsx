import { redirect, notFound } from "next/navigation";
import { AdminModulePage } from "@/components/admin-module-page";
import { getModuleBySlug } from "@/lib/xui-admin-modules";

type Props = { params: Promise<{ module: string }> };

export const dynamicParams = true;

export default async function XuiAdminModulePage({ params }: Props) {
  const { module: slug } = await params;
  const mod = getModuleBySlug(slug);
  if (!mod) notFound();
  if (mod.redirect) redirect(mod.redirect);
  return <AdminModulePage slug={slug} />;
}
