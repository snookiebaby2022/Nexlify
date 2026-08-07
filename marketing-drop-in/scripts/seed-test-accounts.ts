/**
 * Create marketing test accounts for trial + Nexlify License QA.
 *
 * Run on VPS:
 *   cd /var/www/nexlify && npx tsx scripts/seed-test-accounts.ts
 *
 * Requires DATABASE_URL (nexlify_marketing) and license signing key (.license-keys/private.pem).
 */
import bcrypt from "bcryptjs";
import { loadMarketingDatabaseUrl } from "./load-marketing-env";

loadMarketingDatabaseUrl();

const TEST_PASSWORD = process.env.TEST_ACCOUNT_PASSWORD?.trim() || "NexlifyTest2026!";

type AccountKind = "trial" | "nexlify" | "empty" | "retrial";

const TEST_ACCOUNTS: {
  email: string;
  name: string;
  kind: AccountKind;
  trialBypass?: boolean;
}[] = [
  {
    email: "trial.test@nexlify.live",
    name: "Trial Test",
    kind: "trial",
  },
  {
    email: "license.test@nexlify.live",
    name: "Nexlify License Test",
    kind: "nexlify",
  },
  {
    email: "signup.test@nexlify.live",
    name: "Signup Flow Test",
    kind: "empty",
  },
  {
    email: "qa.retrial@nexlify.live",
    name: "QA Retrial",
    kind: "retrial",
    trialBypass: true,
  },
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { issueTrialLicense, resetTrialEligibility } = await import("../src/lib/trial");
  const { issueLicenseForOrder, validateLicenseKey } = await import("../src/lib/licensing");

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);

  console.log("=== Nexlify marketing test accounts ===\n");
  console.log(`Password (all accounts): ${TEST_PASSWORD}\n`);

  for (const spec of TEST_ACCOUNTS) {
    const email = spec.email.toLowerCase();

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name: spec.name,
        passwordHash,
        ...(spec.trialBypass !== undefined ? { trialBypass: spec.trialBypass } : {}),
      },
      create: {
        email,
        name: spec.name,
        passwordHash,
        role: "USER",
        trialBypass: spec.trialBypass ?? false,
      },
    });

    let licenseKey: string | null = null;
    let licenseNote = "";

    if (spec.kind === "trial") {
      await resetTrialEligibility(user.id);
      const license = await issueTrialLicense(user.id);
      licenseKey = license.key;
      licenseNote = `7-day trial · expires ${license.expiresAt?.toISOString() ?? "—"}`;
    } else if (spec.kind === "nexlify") {
      const plan = await prisma.plan.findFirst({ where: { slug: "nexlify", active: true } });
      if (!plan) throw new Error("Nexlify plan missing — run scripts/sync-plans-vps.ts first");

      await prisma.license.deleteMany({ where: { userId: user.id } });
      await prisma.order.deleteMany({ where: { userId: user.id } });

      const order = await prisma.order.create({
        data: {
          userId: user.id,
          planId: plan.id,
          amountCents: 0,
          status: "COMPLETED",
          couponCode: "TEST-SEED",
        },
      });

      const license = await issueLicenseForOrder(order.id);
      if (!license) throw new Error("Failed to issue Nexlify license");
      await prisma.license.update({
        where: { id: license.id },
        data: { status: "ACTIVE" },
      });
      licenseKey = license.key;
      licenseNote = `Nexlify License · ${plan.durationDays} days · ACTIVE`;
    } else if (spec.kind === "empty") {
      await prisma.license.deleteMany({ where: { userId: user.id } });
      await prisma.order.deleteMany({ where: { userId: user.id } });
      licenseNote = "No license — use for /register?trial=1 signup flow test";
    } else if (spec.kind === "retrial") {
      await resetTrialEligibility(user.id);
      licenseNote = "trialBypass enabled — can start a new trial from dashboard";
    }

    console.log(`Email:    ${email}`);
    console.log(`Name:     ${spec.name}`);
    console.log(`Type:     ${spec.kind}`);
    console.log(`License:  ${licenseNote}`);
    if (licenseKey) {
      const check = await validateLicenseKey(licenseKey);
      console.log(`Key:      ${licenseKey}`);
      console.log(`Valid:    ${check.ok ? "yes" : check.error}`);
    }
    console.log(`Login:    https://nexlify.live/login`);
    console.log(`Dashboard: https://nexlify.live/dashboard`);
    console.log("");
  }

  console.log("Panel activation: paste license key at panel.nexlify.live → License → Add License");
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      const { prisma } = await import("../src/lib/prisma");
      await prisma.$disconnect();
    } catch {
      /* ignore */
    }
  });
