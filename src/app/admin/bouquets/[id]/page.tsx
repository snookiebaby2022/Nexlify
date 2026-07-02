"use client";

import { use } from "react";
import { BouquetForm } from "@/components/bouquet-form";

export default function EditBouquetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <BouquetForm bouquetId={id} title="Edit Bouquet" />;
}
