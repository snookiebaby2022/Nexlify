"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type PayPalCheckoutCaptureProps = {
  orderId: string;
};

export function PayPalCheckoutCapture({ orderId }: PayPalCheckoutCaptureProps) {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const paypalSubscriptionId =
      searchParams.get("subscription_id") ??
      searchParams.get("ba_token") ??
      searchParams.get("token") ??
      undefined;
    fetch("/api/checkout/paypal/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, paypalSubscriptionId, paypalOrderId: paypalSubscriptionId }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "PayPal capture failed");
        setDone(true);
        window.location.replace(`/checkout/success?order_id=${orderId}`);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "PayPal capture failed");
      });
  }, [orderId, searchParams]);

  if (error) {
    return <p className="mt-4 text-sm text-red-300">{error}</p>;
  }

  return (
    <p className="mt-4 text-sm text-slate-400">
      {done ? "Payment confirmed — loading your license…" : "Confirming PayPal payment…"}
    </p>
  );
}
