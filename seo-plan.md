# Nexlify SEO Strategy & Implementation Plan

## Current State
- Marketing site: nexlify.live (Next.js 15 App Router)
- Panel: panel.nexlify.live (separate Next.js app)
- Blog: 15+ articles already published
- Existing SEO: pageSeo() helper, metadata exports, JSON-LD, sitemap

## Phase 1: Technical SEO (Immediate)

### 1.1 Sitemap Optimization
- **Current**: Auto-generated sitemap at /sitemap.xml
- **Action**: Verify all pages are included, add blog posts, add lastmod dates
- **Priority**: HIGH

### 1.2 Robots.txt
- **Current**: /robots.txt exists
- **Action**: Verify it allows crawling of /blog, /pricing, /features, /install
- **Priority**: HIGH

### 1.3 Core Web Vitals
- **Issue**: 322KB HTML on every page (61 inline script blocks, 168KB)
- **Action**: Enable ISR on static pages, reduce RSC payload size
- **Impact**: LCP, FID improvements
- **Priority**: HIGH

### 1.4 Canonical URLs
- **Action**: Ensure all pages have canonical URLs pointing to https://nexlify.live
- **Priority**: HIGH

### 1.5 Structured Data
- **Current**: JSON-LD on homepage, pricing, install pages
- **Action**: Add Organization, SoftwareApplication, FAQPage schema
- **Priority**: MEDIUM

## Phase 2: Content SEO (Week 1-2)

### 2.1 Target Keywords
| Keyword | Volume | Difficulty | Current Rank |
|---------|--------|------------|--------------|
| IPTV panel | 2,400 | Medium | Not ranking |
| IPTV reseller panel | 1,600 | Medium | Not ranking |
| IPTV management software | 880 | Low | Not ranking |
| IPTV billing system | 720 | Low | Not ranking |
| Xtream UI alternative | 590 | Low | Not ranking |
| IPTV panel UK | 480 | Low | Not ranking |
| best IPTV panel 2026 | 390 | Low | Not ranking |
| IPTV WHMCS module | 320 | Low | Not ranking |

### 2.2 Content Gaps to Fill
1. **Comparison pages**: "Nexlify vs XUI One", "Nexlify vs 1-Stream" (already exist, optimize)
2. **How-to guides**: "How to start IPTV business", "IPTV reseller setup guide"
3. **Feature pages**: Deep-dive pages for each major feature
4. **Case studies**: Customer success stories
5. **FAQ pages**: Common questions about IPTV panels

### 2.3 Blog Content Calendar
| Week | Article | Target Keyword |
|------|---------|----------------|
| 1 | "Complete Guide to IPTV Panel Management" | IPTV panel |
| 1 | "How to Start an IPTV Reseller Business" | IPTV reseller |
| 2 | "IPTV Billing: Stripe vs PayPal vs WHMCS" | IPTV billing |
| 2 | "Top 5 IPTV Panels Compared (2026)" | best IPTV panel |
| 3 | "Setting Up EPG for IPTV: Step-by-Step" | IPTV EPG setup |
| 3 | "IPTV Security: Protecting Your Streams" | IPTV security |
| 4 | "WHMCS IPTV Module Integration Guide" | IPTV WHMCS |
| 4 | "Scaling IPTV: From 100 to 10,000 Users" | IPTV scaling |

## Phase 3: Off-Page SEO (Week 2-4)

### 3.1 Link Building
- **IPTV forums**: Engage on IPTV-related forums and communities
- **Reddit**: r/IPTV, r/cordcutters (with caution)
- **Product Hunt**: Launch on Product Hunt
- **AlternativeTo**: List as XUI One alternative
- **G2/Capterra**: Get listed on software review sites

### 3.2 Social Signals
- **Twitter/X**: Regular posts about IPTV industry
- **YouTube**: Tutorial videos for panel setup
- **LinkedIn**: B2B content for IPTV businesses

### 3.3 Local SEO (UK)
- **Google Business Profile**: If applicable
- **UK IPTV directories**: List on UK tech directories
- **Local keywords**: "IPTV panel UK", "IPTV reseller UK"

## Phase 4: Performance Optimization (Ongoing)

### 4.1 Page Speed
- Enable ISR for static pages (/, /pricing, /features, /blog/*)
- Implement lazy loading for images
- Optimize font loading (preload critical fonts)
- Reduce JavaScript bundle size

### 4.2 Mobile Optimization
- Ensure all pages are mobile-responsive
- Test on Google's Mobile-Friendly Tool
- Optimize touch targets

### 4.3 Image Optimization
- Use WebP/AVIF formats (already configured)
- Add proper alt text to all images
- Implement lazy loading

## Phase 5: Monitoring & Analytics

### 5.1 Tools Setup
- **Google Search Console**: Verify property, submit sitemap
- **Google Analytics 4**: Track conversions, user behavior
- **Ahrefs/SEMrush**: Monitor rankings and backlinks

### 5.2 KPIs to Track
- Organic traffic growth (target: +50% in 3 months)
- Keyword rankings (target: Top 10 for 5+ keywords)
- Domain authority (target: DA 30+ in 6 months)
- Conversion rate from organic traffic

## Implementation Priority

### Immediate (This Week)
1. Fix technical SEO issues (sitemap, robots.txt, canonical URLs)
2. Add structured data to all pages
3. Optimize Core Web Vitals

### Short-term (Week 1-2)
1. Publish 4 new blog posts
2. Set up Google Search Console
3. Submit sitemap to Google

### Medium-term (Week 2-4)
1. Start link building campaign
2. Publish comparison and how-to pages
3. Set up analytics tracking

### Long-term (Month 2-6)
1. Regular content publishing (2x/week)
2. Build domain authority
3. Monitor and optimize based on data

## Expected Results
- **Month 1**: 50+ new indexed pages, 100+ organic visits/month
- **Month 3**: 500+ organic visits/month, 5+ keywords in top 20
- **Month 6**: 2,000+ organic visits/month, 15+ keywords in top 10
- **Year 1**: 10,000+ organic visits/month, DA 40+
