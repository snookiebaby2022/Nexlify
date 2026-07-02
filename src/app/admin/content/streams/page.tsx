import { StreamsList } from "@/components/streams-list";

export default function ManageStreamsPage() {
  return (
    <StreamsList
      type="LIVE"
      title="Manage Streams"
      addHref="/admin/streams/add"
      importHref="/admin/import/m3u"
    />
  );
}
