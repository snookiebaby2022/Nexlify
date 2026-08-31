# Locked Files Manifest
# Files listed here are stable and should not be modified without explicit approval.
# This manifest is checked by the pre-commit hook (scripts/check-locked-files.sh).
#
# Format: one file path per line (relative to marketing-drop-in/)
# Lines starting with # are comments. Empty lines are ignored.
# Directories end with / and lock ALL files within them.

# ──────────────────────────────────────────────
# CRITICAL: Core business logic & auth
# ──────────────────────────────────────────────
src/lib/auth.ts
src/lib/prisma.ts
src/lib/stripe.ts
src/lib/license.ts
src/lib/licensing.ts
src/lib/plans.ts
src/lib/site.ts
src/lib/site-settings.ts
src/lib/mail.ts
src/lib/security-headers.ts
src/lib/activation-code.ts
src/lib/activation-email.ts
src/lib/panel-sync.ts
src/lib/panel-install.ts
src/lib/rate-limit.ts
src/lib/security-txt.ts

# ──────────────────────────────────────────────
# CRITICAL: Auth & License API routes
# ──────────────────────────────────────────────
src/app/api/auth/login/route.ts
src/app/api/auth/register/route.ts
src/app/api/auth/logout/route.ts
src/app/api/auth/me/route.ts
src/app/api/auth/forgot-password/route.ts
src/app/api/auth/reset-password/route.ts
src/app/api/licenses/validate/route.ts
src/app/api/licenses/register/route.ts
src/app/api/licenses/verify-activation/route.ts
src/app/api/licenses/send-code/route.ts
src/app/api/licenses/sync/route.ts
src/app/api/checkout/route.ts
src/app/api/plans/route.ts
src/app/api/billing/route.ts
src/app/api/health/route.ts

# ──────────────────────────────────────────────
# CRITICAL: Layout & Navigation
# ──────────────────────────────────────────────
src/app/layout.tsx
src/app/globals.css
src/components/Navbar.tsx
src/components/MobileNav.tsx
src/components/Footer.tsx
src/components/ConditionalShell.tsx
src/components/ClientErrorBoundary.tsx
src/components/AuthForm.tsx

# ──────────────────────────────────────────────
# CRITICAL: Homepage & Core Pages
# ──────────────────────────────────────────────
src/app/page.tsx
src/app/pricing/page.tsx
src/app/features/page.tsx
src/app/install/page.tsx
src/app/demo/page.tsx
src/app/login/page.tsx
src/app/register/page.tsx
src/app/dashboard/page.tsx
src/app/checkout/success/page.tsx
src/app/order/success/page.tsx

# ──────────────────────────────────────────────
# CRITICAL: Legal Pages
# ──────────────────────────────────────────────
src/app/terms/page.tsx
src/app/privacy/page.tsx
src/app/refund-policy/page.tsx
src/components/TermsContent.tsx
src/components/PrivacyContent.tsx
src/components/ContentDisclaimer.tsx
src/components/ComplianceSection.tsx

# ──────────────────────────────────────────────
# CRITICAL: Hero & Homepage Components
# ──────────────────────────────────────────────
src/components/Hero.tsx
src/components/HeroPanelCarousel.tsx
src/components/HomeBelowFold.tsx
src/components/Features.tsx
src/components/PricingSection.tsx
src/components/PricingCheckoutLauncher.tsx

# ──────────────────────────────────────────────
# CRITICAL: SEO & Structured Data
# ──────────────────────────────────────────────
src/app/sitemap.ts
src/app/robots.ts
src/lib/seo.ts
src/components/JsonLd.tsx
src/components/JsonLdScript.tsx
src/components/WebPageJsonLd.tsx
src/components/BreadcrumbJsonLd.tsx
src/components/FaqJsonLd.tsx
src/components/HowToJsonLd.tsx
src/components/DocsArticleJsonLd.tsx
src/components/SoftwareProductJsonLd.tsx
src/components/WhmcsDocsJsonLd.tsx
src/components/PricingJsonLd.tsx

# ──────────────────────────────────────────────
# CRITICAL: Analytics & Tracking
# ──────────────────────────────────────────────
src/components/GoogleAnalytics.tsx
src/components/GoogleAnalyticsPageView.tsx
src/components/GoogleTagManager.tsx
src/components/UmamiAnalytics.tsx
src/components/AdPixels.tsx
src/components/ConversionTracker.tsx
src/components/DeferredMarketingScripts.tsx

# ──────────────────────────────────────────────
# CRITICAL: Installer
# ──────────────────────────────────────────────
src/components/PanelInstaller.tsx
src/components/PanelInstallInstructions.tsx

# ──────────────────────────────────────────────
# CRITICAL: Config files
# ──────────────────────────────────────────────
next.config.ts
tsconfig.json
tailwind.config.ts
postcss.config.mjs
vercel.json
prisma/schema.prisma
package.json

# ──────────────────────────────────────────────
# CRITICAL: Public assets (branding)
# ──────────────────────────────────────────────
public/favicon.ico
public/icon.png
public/icon-512.png
public/apple-icon.png
public/apple-touch-icon.png
public/opengraph-image.png
public/twitter-image.png
public/manifest.json
public/panel-releases.json

# ──────────────────────────────────────────────
# CRITICAL: Install scripts
# ──────────────────────────────────────────────
public/install/panel.sh
public/install/fix-ip-login.sh

# ──────────────────────────────────────────────
# CRITICAL: Nginx config
# ──────────────────────────────────────────────
nexlify.live.conf
deploy/nginx-security-headers.conf

# ──────────────────────────────────────────────
# CRITICAL: Admin API routes
# ──────────────────────────────────────────────
src/app/api/admin/stats/route.ts
src/app/api/admin/users/route.ts
src/app/api/admin/licenses/route.ts
src/app/api/admin/licenses/export/route.ts
src/app/api/admin/orders/route.ts
src/app/api/admin/plans/route.ts
src/app/api/admin/coupons/route.ts
src/app/api/admin/tickets/route.ts
src/app/api/admin/content/route.ts
src/app/api/admin/newsletter/route.ts
src/app/api/admin/health/route.ts
src/app/api/admin/deploy/route.ts
src/app/api/admin/audit/route.ts
src/app/api/admin/profile/route.ts
src/app/api/admin/settings/route.ts
src/app/api/admin/remote-update/route.ts
src/app/api/admin/remote-update/broadcast/route.ts
src/app/api/admin/remote-unlock-ip/route.ts
src/app/api/admin/remote-categories/route.ts
src/app/api/admin/remote-categories/broadcast/route.ts

# ──────────────────────────────────────────────
# CRITICAL: Admin pages
# ──────────────────────────────────────────────
src/app/admin/page.tsx
src/app/admin/tickets/page.tsx
src/app/admin/licenses/page.tsx
src/app/admin/profile/page.tsx

# ──────────────────────────────────────────────
# CRITICAL: Admin lib modules
# ──────────────────────────────────────────────
src/lib/admin-stats.ts
src/lib/admin-license.ts
src/lib/admin-canned-replies.ts
src/lib/license-admin.ts
src/lib/license-server-admin.ts
src/lib/license-deletable.ts
src/lib/audit.ts

# ──────────────────────────────────────────────
# MEDIUM: Blog system (SEO content)
# ──────────────────────────────────────────────
src/app/blog/page.tsx
src/app/blog/[slug]/page.tsx
src/lib/blog-metadata.ts
src/lib/blog-registry.ts
src/lib/blog-types.ts
src/lib/seo-pages.ts
src/lib/seo-keywords.ts
src/lib/entertainment-keywords.ts
src/lib/problem-solution-posts.ts
src/lib/software-schema.ts
src/components/BlogArticleShell.tsx
src/components/BlogMigrationVisual.tsx
src/components/BlogResourceLinks.tsx
src/components/ProblemSolutionBlogPage.tsx

# ──────────────────────────────────────────────
# MEDIUM: Comparison & VS pages
# ──────────────────────────────────────────────
src/app/compare/xtream-panel/page.tsx
src/app/compare/xtream-panel/page.tsx
src/app/vs/xui-one/page.tsx
src/app/vs/1-stream/page.tsx
src/components/ComparePageShell.tsx

# ──────────────────────────────────────────────
# MEDIUM: Marketing lib modules
# ──────────────────────────────────────────────
src/lib/marketing-coupon.ts
src/lib/marketing-constants.ts
src/lib/plan-marketing.ts
src/lib/lp-geo-content.ts
src/lib/growth-urls.ts
src/lib/demo.ts
src/lib/help-faq.ts
src/lib/analytics.ts
src/lib/trial.ts
src/lib/updates.ts

# ──────────────────────────────────────────────
# MEDIUM: Marketing components
# ──────────────────────────────────────────────
src/components/MarketingOverlays.tsx
src/components/FreeLaunchBanner.tsx
src/components/CouponLaunchBanner.tsx
src/components/TrialCtaButton.tsx
src/components/TrialCouponBanner.tsx
src/components/TrialCouponRedirect.tsx
src/components/NewsletterSignup.tsx
src/components/LeadMagnetSignup.tsx
src/components/PageCta.tsx
src/components/SocialProofSection.tsx
src/components/TrustStrip.tsx
src/components/WhatsNewSection.tsx
src/components/MigrationCtaSection.tsx
src/components/CookieConsent.tsx
src/components/IncludedFeaturesSection.tsx
src/components/TechStackSection.tsx
src/components/SystemRequirementsSection.tsx
src/components/UpdatesList.tsx
src/components/HelpFaqSection.tsx
src/components/ObsSetupPanel.tsx

# ──────────────────────────────────────────────
# MEDIUM: Landing pages
# ──────────────────────────────────────────────
src/app/lp/reseller-panel/page.tsx
src/app/lp/reseller-panel-uk/page.tsx
src/app/pricing/page.tsx
src/app/lp/live-tv-streaming-platform/page.tsx
src/app/lp/cut-the-cord-streaming/page.tsx
src/components/LpCtaPage.tsx
src/components/LpHeader.tsx
src/components/LpGeoSections.tsx
src/components/promo-landing.tsx

# ──────────────────────────────────────────────
# MEDIUM: Demo components
# ──────────────────────────────────────────────
src/app/demo/page.tsx
src/components/demo/PanelPreview.tsx
src/components/demo/PanelChrome.tsx
src/components/demo/panel-slide-views.tsx
src/components/demo/DemoLaunchCard.tsx
src/components/DemoBanner.tsx
src/components/DemoScreenshots.tsx
src/lib/demo.ts

# ──────────────────────────────────────────────
# MEDIUM: Support system
# ──────────────────────────────────────────────
src/app/support/[id]/page.tsx
src/components/SupportNav.tsx
src/components/support/TicketThread.tsx
src/components/support/NewTicketForm.tsx
src/lib/tickets.ts
src/app/api/support/tickets/route.ts

# ──────────────────────────────────────────────
# MEDIUM: Other helper pages
# ──────────────────────────────────────────────
src/app/status/page.tsx
src/app/requirements/page.tsx
src/app/epg/page.tsx
src/app/livestream/page.tsx
src/app/brand/page.tsx
src/app/updates/page.tsx
src/app/affiliates/page.tsx
src/app/grow/page.tsx
src/app/grow/links/page.tsx
src/app/help/page.tsx
src/app/billing/page.tsx
src/app/best-iptv-reseller-panel/page.tsx
src/app/forgot-password/page.tsx
src/app/reset-password/[token]/page.tsx
src/app/promo/page.tsx
src/app/promo/tiktok/page.tsx
src/app/promo/tiktok-demo/page.tsx
src/app/promo/meta-ad/page.tsx

# ──────────────────────────────────────────────
# MEDIUM: Other helper components
# ──────────────────────────────────────────────
src/components/AnimatedAvatar.tsx
src/components/HomeSeoContent.tsx
src/components/HomeFaqJsonLd.tsx
src/components/PricingComparisonTable.tsx
src/components/PluginPricingSection.tsx
src/components/LegacyPanelPricingCompare.tsx
src/components/DemoBanner.tsx
src/components/CopyButton.tsx
src/components/FacebookIcon.tsx
src/components/TelegramIcon.tsx
src/components/LivestreamPlayer.tsx
src/components/GrowthShell.tsx (src/app/grow/layout.tsx)
src/components/growth/GrowthShell.tsx
src/components/growth/GrowthOverview.tsx
src/components/growth/GrowthLinksPage.tsx
src/components/growth/CopyLinkButton.tsx
src/components/promo/PromoLanding.tsx
src/components/promo/NexlifyMetaAd.tsx
src/components/promo/TikTokSellAd.tsx
src/components/promo/TikTokDemoWalkthrough.tsx

# ──────────────────────────────────────────────
# MEDIUM: Other helper lib modules
# ──────────────────────────────────────────────
src/lib/geo.ts
src/lib/format.ts
src/lib/system-requirements.ts
src/lib/webplayer-proxy.ts
src/lib/livestream.ts
src/lib/livestream-viewers.ts

# ──────────────────────────────────────────────
# MEDIUM: Other API routes
# ──────────────────────────────────────────────
src/app/api/trial/status/route.ts
src/app/api/newsletter/route.ts
src/app/api/install-command/route.ts
src/app/api/livestream/status/route.ts
src/app/api/livestream/leave/route.ts
src/app/api/panel-releases/route.ts
src/app/api/markdown/lp/[...slug]/route.ts

# ──────────────────────────────────────────────
# MEDIUM: Other config
# ──────────────────────────────────────────────
src/middleware.ts
src/app/grow/layout.tsx
src/app/support/layout.tsx
src/app/livestream/layout.tsx
src/app/livestream/loading.tsx
src/hooks/useLiveInstallCommand.ts
.browserslistrc
ENV_MARKETING.example.txt

# ──────────────────────────────────────────────
# DO NOT LOCK (secrets/auto-generated):
# .env.local
# .license-keys/private.pem
# src/generated/prisma/
# package-lock.json
# tsconfig.tsbuildinfo
# next-env.d.ts
# ──────────────────────────────────────────────
