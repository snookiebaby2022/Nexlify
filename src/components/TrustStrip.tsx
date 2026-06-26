import {
  TRUST_ACTIVE_LINES,
  TRUST_COUNTRIES,
  TRUST_OPERATORS,
} from "@/lib/marketing-constants";

function trustLabel(): string {
  if (TRUST_OPERATORS && TRUST_ACTIVE_LINES && TRUST_COUNTRIES) {
    return `Trusted by ${TRUST_OPERATORS} operators · ${TRUST_ACTIVE_LINES} active lines · ${TRUST_COUNTRIES} countries`;
  }
  if (TRUST_OPERATORS && TRUST_ACTIVE_LINES) {
    return `Trusted by ${TRUST_OPERATORS} operators · ${TRUST_ACTIVE_LINES} active lines`;
  }
  if (TRUST_OPERATORS) {
    return `Trusted by ${TRUST_OPERATORS} operators worldwide`;
  }
  return "Trusted by operators Worldwide · Worldwide support";
}

export function TrustStrip() {
  return (
    <section
      aria-label="Operator trust metrics"
      className="border-b border-white/10 bg-[#0a0814]/80"
    >
      <div className="mx-auto max-w-6xl px-4 py-4 text-center">
        <p className="text-sm font-medium tracking-wide text-slate-300">{trustLabel()}</p>
      </div>
    </section>
  );
}
