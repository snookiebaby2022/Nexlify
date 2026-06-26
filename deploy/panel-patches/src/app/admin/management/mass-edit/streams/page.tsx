import { StreamsMassEdit } from "@/components/streams-mass-edit";

export default function MassEditStreamsPage() {
  return (
    <StreamsMassEdit
      title="Mass edit — live streams"
      description="Bulk enable, disable, delete, set category, or set on-demand mode on live TV streams."
      typeFilter="LIVE"
    />
  );
}
