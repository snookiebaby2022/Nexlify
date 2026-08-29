import { getSession } from "@/lib/auth";
import { listManageLinesBouquets, listManageLinesPage } from "@/lib/manage-lines-list";
import { DEFAULT_LIST_PAGE_SIZE } from "@/lib/list-page-sizes";
import { ResellerLinesClient } from "./lines-client";

export default async function ResellerLinesPage({
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
    <ResellerLinesClient
      initial={initial}
      initialBouquets={initialBouquets}
      editId={sp.edit ?? null}
    />
  );
}
