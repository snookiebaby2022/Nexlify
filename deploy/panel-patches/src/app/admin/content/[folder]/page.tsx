import { redirect, notFound } from "next/navigation";
import { ContentFolderPage } from "@/components/content-folder-page";
import { CONTENT_FOLDER_SLUGS, getContentFolder, type ContentFolderSlug } from "@/lib/content-folders";

type Props = { params: Promise<{ folder: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return CONTENT_FOLDER_SLUGS.map((folder) => ({ folder }));
}

export default async function AdminContentFolderPage({ params }: Props) {
  const { folder } = await params;
  if (!CONTENT_FOLDER_SLUGS.includes(folder as ContentFolderSlug)) notFound();
  const def = getContentFolder(folder);
  if (def?.adminRedirect && folder !== "vod") redirect(def.adminRedirect);
  return <ContentFolderPage panel="admin" slug={folder as ContentFolderSlug} />;
}
