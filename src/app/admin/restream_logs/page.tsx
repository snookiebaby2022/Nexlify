import { ActivityLogsPage } from "@/components/activity-logs-page";

export default function Page() {
  return (
    <ActivityLogsPage
      title="Restream logs"
      description="Theft detection and multi-connection alerts."
      actionFilter="theft"
    />
  );
}
