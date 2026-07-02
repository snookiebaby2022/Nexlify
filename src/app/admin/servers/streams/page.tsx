import { redirect } from "next/navigation";
import { StreamManageEditPage } from "@/components/stream-manage-edit-page";

type Props = { searchParams: Promise<{ edit?: string }> };

export default async function ServerStreamsPage({ searchParams }: Props) {
  const { edit } = await searchParams;
  if (!edit?.trim()) redirect("/admin/content/streams");
  return <StreamManageEditPage streamId={edit.trim()} />;
}
