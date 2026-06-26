import { redirect, notFound } from "next/navigation";
import { ContentFolderPage } from "@/components/content-folder-page";
import { CONTENT_FOLDER_SLUGS, getContentFolder, type ContentFolderSlug } from "@/lib/content-folders";

type Props = { params: Promise<{ folder: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return CONTENT_FOLDER_SLUGS.map((folder) => ({ folder }));
}

export default async function ResellerContentFolderPage({ params }: Props) {
  const { folder } = await params;
  if (!CONTENT_FOLDER_SLUGS.includes(folder as ContentFolderSlug)) notFound();
  const def = getContentFolder(folder);
  if (def?.resellerRedirect && folder !== "vod") redirect(def.resellerRedirect);
  return <ContentFolderPage panel="reseller" slug={folder as ContentFolderSlug} />;
}
