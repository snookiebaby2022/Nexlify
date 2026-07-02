import { BlocklistPage } from "@/components/blocklist-page";

export default function BlockedUserAgentsPage() {
  return (
    <BlocklistPage
      type="user-agent"
      title="Blocked user agents"
      description="Block clients matching a user-agent pattern (substring)."
      valueLabel="Pattern"
      valuePlaceholder="User-agent substring"
    />
  );
}
