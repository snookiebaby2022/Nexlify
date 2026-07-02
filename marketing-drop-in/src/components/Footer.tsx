import type { ReactNode } from "react";
import Link from "next/link";
import { FacebookIcon } from "@/components/FacebookIcon";
import { TelegramIcon } from "@/components/TelegramIcon";
import { SupportFooterLinks } from "@/components/SupportNav";
import {
  CONTENT_DISCLAIMER,
  FACEBOOK_URL,
  SOFTWARE_POSITIONING,
  TELEGRAM_CHANNEL_URL,
  TELEGRAM_URL,
} from "@/lib/marketing-constants";
import { site } from "@/lib/site";

function SocialLink({
  href,
  label,
  icon,
  className = "",
  variant = "prominent",
  trackEvent,
  trackLabel,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  className?: string;
  variant?: "prominent" | "inline";
  trackEvent?: string;
  trackLabel?: string;
}) {
  const isInline = variant === "inline";
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-track={trackEvent}
      data-track-label={trackLabel}
      className={`inline-flex items-center transition-colors ${
        isInline
          ? "gap-1.5 text-xs text-[var(--muted)] hover:text-white"
          : "gap-2.5 hover:opacity-90"
      } ${className}`}
    >
      {icon}
      <span className={isInline ? "font-medium" : "text-base font-semibold text-white"}>
        {label}
      </span>
    </a>
  );
}

function TelegramLink({
  href,
  label,
  className = "",
  variant = "prominent",
  trackLabel,
}: {
  href: string;
  label: string;
  className?: string;
  variant?: "prominent" | "inline";
  trackLabel?: string;
}) {
  const isInline = variant === "inline";
  return (
    <SocialLink
      href={href}
      label={label}
      className={className}
      variant={variant}
      trackEvent={trackLabel ? "telegram_click" : undefined}
      trackLabel={trackLabel}
      icon={
        <TelegramIcon
          size={isInline ? 16 : 22}
          className="text-[#2AABEE]"
        />
      }
    />
  );
}

function FacebookLink({
  href,
  label,
  className = "",
  variant = "prominent",
  trackLabel,
}: {
  href: string;
  label: string;
  className?: string;
  variant?: "prominent" | "inline";
  trackLabel?: string;
}) {
  const isInline = variant === "inline";
  return (
    <SocialLink
      href={href}
      label={label}
      className={className}
      variant={variant}
      trackEvent={trackLabel ? "facebook_click" : undefined}
      trackLabel={trackLabel}
      icon={
        <FacebookIcon
          size={isInline ? 16 : 22}
          className="text-[#1877F2]"
        />
      }
    />
  );
}

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#05040a]">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-6">
          <div className="md:col-span-2">
            <p className="font-display text-xl font-semibold text-white">{site.name}</p>
            <p className="mt-1 text-sm text-violet-300">{site.domain}</p>
            <p className="mt-3 max-w-sm text-sm text-[var(--muted)]">
              {SOFTWARE_POSITIONING}. WHMCS billing with automated keys and built-in support
              tickets. {CONTENT_DISCLAIMER}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-300">Product</p>
            <ul className="mt-4 space-y-2 text-sm text-[var(--muted)]">
              <li><Link href="/blog/migrate-from-xui-or-1-stream" className="hover:text-white transition-colors">Migration checklist</Link></li>
              <li><Link href="/vs/xui-one" className="hover:text-white transition-colors">Nexlify vs XUI.one</Link></li>
              <li><Link href="/best-iptv-reseller-panel" className="hover:text-white transition-colors">Panel comparison</Link></li>
              <li><Link href="/blog" className="hover:text-white transition-colors">Reseller blog</Link></li>
              <li><Link href="/install" className="hover:text-white transition-colors">Panel installer</Link></li>
              <li><Link href="/requirements" className="hover:text-white transition-colors">System requirements</Link></li>
              <li><Link href="/help" className="hover:text-white transition-colors">Help &amp; FAQ</Link></li>
              <li><Link href="/updates" className="hover:text-white transition-colors">Panel updates</Link></li>
              <li><Link href="/status" className="hover:text-white transition-colors">Service status</Link></li>
              <li><Link href="/demo" className="hover:text-white transition-colors">Panel demo</Link></li>
              <li><Link href="/livestream" className="hover:text-white transition-colors">Live stream</Link></li>
              <li><Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-300">Support</p>
            <SupportFooterLinks />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-300">Account</p>
            <ul className="mt-4 space-y-2 text-sm text-[var(--muted)]">
              <li><Link href="/login" className="hover:text-white transition-colors">Sign in</Link></li>
              <li><Link href="/register" className="hover:text-white transition-colors">Register</Link></li>
              <li><Link href="/dashboard" className="hover:text-white transition-colors">My licenses</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-300">Get in Touch</p>
            <div className="mt-4 space-y-3">
              <TelegramLink
                href={TELEGRAM_CHANNEL_URL}
                label="Telegram channel"
                trackLabel="footer_telegram_channel"
              />
              <TelegramLink
                href={TELEGRAM_URL}
                label="Telegram community"
                variant="prominent"
                className="opacity-90"
                trackLabel="footer_telegram_community"
              />
              <FacebookLink
                href={FACEBOOK_URL}
                label="Facebook"
                trackLabel="footer_facebook"
              />
            </div>
          </div>
        </div>
        <p className="mt-12 border-t border-white/10 pt-8 text-center text-xs text-[var(--muted)]">
          <span className="block max-w-2xl mx-auto mb-4 text-[var(--muted)]">{CONTENT_DISCLAIMER}</span>
          © {new Date().getFullYear()} {site.name} · {site.url.replace(/^https?:\/\//, "")} ·{" "}
          <Link href="/terms" className="hover:text-white transition-colors">
            Terms and conditions
          </Link>
          {" · "}
          <Link href="/refund-policy" className="hover:text-white transition-colors">
            Refund policy
          </Link>
          {" · "}
          <TelegramLink
            href={TELEGRAM_CHANNEL_URL}
            label="Telegram"
            variant="inline"
            className="align-middle"
            trackLabel="footer_telegram_inline"
          />
          {" · "}
          <FacebookLink
            href={FACEBOOK_URL}
            label="Facebook"
            variant="inline"
            className="align-middle"
            trackLabel="footer_facebook_inline"
          />
        </p>
      </div>
    </footer>
  );
}
