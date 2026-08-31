-- New billing events are recorded as generic billing, not a named vendor.
ALTER TABLE "BillingEvent" ALTER COLUMN "provider" SET DEFAULT 'billing';
