import { getSession } from "@/lib/auth";
import { listManageLinesBouquets, listManageLinesPage } from "@/lib/manage-lines-list";
import { DEFAULT_LIST_PAGE_SIZE } from "@/lib/list-page-sizes";
import { AdminLinesClient } from "./lines-client";

export default async function AdminLinesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const session = await getSession();
  if (!session) return null;

  const sp = await searchParams;
  const [initial, initialBouquets] = await Promise.all([
    listManageLinesPage({ session, page: 1, pageSize: DEFAULT_LIST_PAGE_SIZE }),
    listManageLinesBouquets(session),
  ]);

  return (
    <AdminLinesClient
      initial={initial}
      initialBouquets={initialBouquets}
      editId={sp.edit ?? null}
    />
  );
}
