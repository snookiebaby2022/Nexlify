const certificates = [
  {
    standard: "ISO 9001:2015",
    badgeTop: "9001 2015",
    badgeBottom: "CERTIFIED",
    certificateNo: "22559 C",
  },
  {
    standard: "EN ISO/IEC 27001:2022",
    badgeTop: "/IEC 27001: 2022",
    badgeBottom: "CERTIFIED",
    certificateNo: "22559 SI",
  },
];

function IsoBadge({ top, bottom }: { top: string; bottom: string }) {
  return (
    <div className="mx-auto w-full max-w-[220px] rounded-lg border border-violet-500/30 bg-white/5 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-3xl font-light text-violet-300" aria-hidden>
          ✓
        </span>
        <div className="leading-tight text-violet-200">
          <p className="text-lg font-bold tracking-tight">
            ISO
            <span className="font-semibold">{top}</span>
          </p>
          <p className="text-sm font-bold tracking-wide">{bottom}</p>
        </div>
      </div>
    </div>
  );
}

export function ComplianceSection() {
  return (
    <section className="border-y border-white/10 bg-[#0a0814]">
      <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
        <p className="text-center text-sm font-semibold uppercase tracking-widest text-violet-400">
          Compliance
        </p>
        <h2 className="font-display mt-3 text-center text-2xl font-bold text-white md:text-3xl lg:text-4xl">
          Nexlify Complies to Standards and Regulations Certificates
        </h2>

        <div className="mt-12 grid gap-8 md:grid-cols-2 md:gap-10">
          {certificates.map((cert) => (
            <article
              key={cert.standard}
              className="glass flex flex-col items-center rounded-2xl px-8 py-10 text-center shadow-lg"
            >
              <IsoBadge top={cert.badgeTop} bottom={cert.badgeBottom} />
              <p className="mt-8 text-xl font-bold text-white md:text-2xl">{cert.standard}</p>
              <p className="mt-3 text-sm font-medium text-[var(--muted)] md:text-base">
                Certificate no.: {cert.certificateNo}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
