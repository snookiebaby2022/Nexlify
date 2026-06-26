import { ActivityLogsPage } from "@/components/activity-logs-page";

export default function Page() {
  return (
    <ActivityLogsPage
      title="Client logs"
      description="Playback and line activity from the last sessions."
      actionFilter="watch"
    />
  );
}
