const TESTIMONIALS = [

  {

    quote:

      "Migrated from a legacy Xtream panel in one afternoon. WHMCS provisioning just works — GBP billing with no manual license CSVs.",

    name: "James R.",

    flag: "🇬🇧",

    lines: "850 lines",

    region: "Manchester, UK",

  },

  {

    quote:

      "The demo sold us before checkout. Anti-Freeze and sub-second zapping cut our support tickets compared to our old panel stack.",

    name: "Marcus T.",

    flag: "🇺🇸",

    lines: "1,200 lines",

    region: "Texas, USA",

  },

  {

    quote:

      "We run 2,000+ lines across sub-resellers. Nexlify's management tool and Telegram alerts when streams drop are worth the license alone.",

    name: "Elena V.",

    flag: "🇪🇺",

    lines: "2,100 lines",

    region: "Amsterdam · US clients",

  },

] as const;



const CASE_STUDIES = [

  {

    title: "500 → 2,000 lines with Nexlify",

    summary:

      "Operator cut support load with WHMCS automation, Anti-Freeze, and Telegram alerts — read the full case study.",

    href: "/blog/case-study-500-to-2000-lines",

  },

  {

    title: "WHMCS IPTV module automation",

    summary:

      "Our host connected order, suspend, and renew hooks so panel license state stays synced with Stripe and PayPal checkouts.",

    href: "/blog/whmcs-iptv-automation-setup",

  },

  {

    title: "Trial → paid in 3 days",

    summary:

      "Reseller started the 7-day trial, tested the live demo with sub-users, then upgraded to Main tier with coupon checkout.",

    href: "/register?trial=1",

  },

] as const;



export function SocialProofSection() {

  return (

    <section className="border-y border-white/10 bg-[#0a0814] py-20 md:py-28">

      <div className="mx-auto max-w-6xl px-4">

        <p className="text-sm font-semibold uppercase tracking-widest text-violet-400/90">

          Trusted by operators

        </p>

        <h2 className="font-display mt-3 text-2xl font-bold text-white sm:text-3xl md:text-4xl">

          IPTV resellers worldwide choose Nexlify

        </h2>

        <p className="mt-4 max-w-2xl text-[var(--muted)]">

          Service providers use Nexlify as their best reseller panel — from solo operators to teams

          running thousands of active lines.

        </p>



        <div className="mt-12 grid gap-6 md:grid-cols-3">

          {TESTIMONIALS.map((t) => (

            <blockquote key={t.name} className="glass rounded-2xl p-6">

              <p className="text-sm leading-relaxed text-slate-200">&ldquo;{t.quote}&rdquo;</p>

              <footer className="mt-4 text-xs text-[var(--muted)]">

                <span className="font-semibold text-slate-300">

                  {t.flag} {t.name}

                </span>

                {" · "}

                {t.lines}

                <br />

                {t.region}

              </footer>

            </blockquote>

          ))}

        </div>



        <h3 className="font-display mt-16 text-xl font-semibold text-white">Case studies</h3>

        <div className="mt-6 grid gap-6 md:grid-cols-3">

          {CASE_STUDIES.map((c) => (

            <a

              key={c.title}

              href={c.href}

              className="glass block rounded-2xl p-6 transition-colors hover:border-violet-500/30"

            >

              <h4 className="font-semibold text-violet-200">{c.title}</h4>

              <p className="mt-2 text-sm text-[var(--muted)]">{c.summary}</p>

            </a>

          ))}

        </div>

      </div>

    </section>

  );

}


