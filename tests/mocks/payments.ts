/** Payment gateway test double — no real Stripe/PayPal calls. */
export type MockPaymentIntent = {
  id: string;
  amountCents: number;
  currency: string;
  status: "requires_payment_method" | "succeeded" | "canceled";
  metadata?: Record<string, string>;
};

function state() {
  globalThis.__nexlifyTestMocks = globalThis.__nexlifyTestMocks || {
    ffmpegSpawns: 0,
    fetchCalls: 0,
    smtpTransports: 0,
    smtpMails: 0,
    payments: [] as MockPaymentIntent[],
  };
  return globalThis.__nexlifyTestMocks as {
    payments: MockPaymentIntent[];
    [k: string]: unknown;
  };
}

export function mockCreatePaymentIntent(input: {
  amountCents: number;
  currency?: string;
  metadata?: Record<string, string>;
}): MockPaymentIntent {
  const intent: MockPaymentIntent = {
    id: `pi_test_${state().payments.length + 1}`,
    amountCents: input.amountCents,
    currency: input.currency ?? "gbp",
    status: "succeeded",
    metadata: input.metadata,
  };
  state().payments.push(intent);
  return intent;
}

export function mockListPayments(): MockPaymentIntent[] {
  return [...state().payments];
}

export function mockResetPayments() {
  state().payments = [];
}
