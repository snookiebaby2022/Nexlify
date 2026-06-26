import { StreamsMassEdit } from "@/components/streams-mass-edit";
import Link from "next/link";

export default function RadiosMassEditPage() {
  return (
    <div className="space-y-4">
      <Link href="/admin/radios" className="text-sm link-back">
        ← Radio stations
      </Link>
      <StreamsMassEdit
        title="Mass edit — radio streams"
        description="Select your radio streams to enable, disable, delete, or change category in bulk."
        typeFilter="LIVE"
        radioOnly
      />
    </div>
  );
}
