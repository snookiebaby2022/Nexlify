import { ActivityLogsPage } from "@/components/activity-logs-page";

export default function Page() {
  return (
    <ActivityLogsPage
      title="Login logs"
      description="Panel login attempts (success and failure)."
      actionFilter="panel_login"
    />
  );
}
