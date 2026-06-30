"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { EpisodesManageTable } from "@/components/episodes-manage-table";

function EpisodesPageInner() {
  const searchParams = useSearchParams();
  const seriesId = searchParams.get("seriesId") ?? undefined;
  return <EpisodesManageTable initialSeriesId={seriesId} />;
}

export default function ManageEpisodesPage() {
  return (
    <Suspense>
      <EpisodesPageInner />
    </Suspense>
  );
}
