import { redirect, notFound } from "next/navigation";
import { ResellerModulePage } from "@/components/reseller-module-page";
import { getResellerModuleBySlug } from "@/lib/xui-reseller-modules";

type Props = { params: Promise<{ module: string }> };

export const dynamicParams = true;

export default async function XuiResellerModulePage({ params }: Props) {
  const { module: slug } = await params;
  const mod = getResellerModuleBySlug(slug);
  if (!mod) notFound();
  if (mod.redirect) redirect(mod.redirect);
  return <ResellerModulePage slug={slug} />;
}
