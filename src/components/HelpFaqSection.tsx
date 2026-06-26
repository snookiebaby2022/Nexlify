export function HelpQuickLinks() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="glass rounded-2xl p-5">
        <h3 className="font-semibold text-violet-200">Documentation</h3>
        <p className="mt-2 text-xs text-[var(--muted)]">Browse guides and API docs.</p>
      </div>
      <div className="glass rounded-2xl p-5">
        <h3 className="font-semibold text-violet-200">Support Tickets</h3>
        <p className="mt-2 text-xs text-[var(--muted)]">Open an in-panel ticket for help.</p>
      </div>
      <div className="glass rounded-2xl p-5">
        <h3 className="font-semibold text-violet-200">Community</h3>
        <p className="mt-2 text-xs text-[var(--muted)]">Join Telegram for updates.</p>
      </div>
    </div>
  );
}

export function HelpFaqSection() {
  return (
    <section className="py-12">
      <h2 className="text-2xl font-bold text-white">Frequently Asked Questions</h2>
      <p className="mt-4 text-[var(--muted)]">
        Contact support@nexlify.live for detailed help.
      </p>
    </section>
  );
}
