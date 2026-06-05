import { ProviderUrlTools } from "@/components/provider-url-tools";

export default function ProviderUrlsToolsPage() {
  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Provider URL tools</h1>
        <p className="text-sm opacity-70">
          Bulk-update stream URLs when a provider changes their base URL or when you need to replace a
          host across many channels.
        </p>
      </div>
      <ProviderUrlTools />
    </div>
  );
}
