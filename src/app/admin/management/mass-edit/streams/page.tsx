import { StreamsMassEdit } from "@/components/streams-mass-edit";

export default function MassEditStreamsPage() {
  return (
    <StreamsMassEdit
      title="Mass edit — live streams"
      description="Bulk enable, disable, delete, set category, bouquet, server, speed, adult flag, and on-demand mode on live TV streams."
      typeFilter="LIVE"
    />
  );
}
