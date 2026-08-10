-- Migration v2b: Add all missing columns to crypto_payments + create payment_intents indexes

-- ── crypto_payments: missing columns ─────────────────────────────
ALTER TABLE crypto_payments ADD COLUMN IF NOT EXISTS "paymentIntentId" TEXT;
ALTER TABLE crypto_payments ADD COLUMN IF NOT EXISTS "provider" TEXT DEFAULT 'CRYPTOMUS';
ALTER TABLE crypto_payments ADD COLUMN IF NOT EXISTS "enteredAmount" NUMERIC(18,2);
ALTER TABLE crypto_payments ADD COLUMN IF NOT EXISTS "invoiceCurrency" TEXT DEFAULT 'USD';
ALTER TABLE crypto_payments ADD COLUMN IF NOT EXISTS "paymentAmountUsd" NUMERIC(18,8);
ALTER TABLE crypto_payments ADD COLUMN IF NOT EXISTS "commission" NUMERIC(36,18);

-- Populate provider column from existing data (safe default)
UPDATE crypto_payments SET "provider" = 'CRYPTOMUS' WHERE "provider" IS NULL;

-- Populate enteredAmount from old 'amount' column if it exists
UPDATE crypto_payments SET "enteredAmount" = amount::NUMERIC WHERE "enteredAmount" IS NULL AND amount IS NOT NULL;

-- Populate invoiceCurrency from old 'currency' column if it exists
UPDATE crypto_payments SET "invoiceCurrency" = currency WHERE "invoiceCurrency" IS NULL AND currency IS NOT NULL;

-- ── payment_intents: unique index ─────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS payment_intents_public_id_key ON payment_intents ("publicId");
CREATE INDEX IF NOT EXISTS payment_intents_order_id_idx ON payment_intents ("orderId");
CREATE INDEX IF NOT EXISTS payment_intents_status_idx ON payment_intents (status);

-- ── crypto_payments: unique indexes ───────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS crypto_payments_cryptomus_uuid_key ON crypto_payments ("cryptomusUuid");
CREATE UNIQUE INDEX IF NOT EXISTS crypto_payments_cryptomus_order_id_key ON crypto_payments ("cryptomusOrderId");

-- ── webhook_events: set default for payloadJson ───────────────────
ALTER TABLE webhook_events ALTER COLUMN "payloadJson" SET DEFAULT '{}'::JSONB;
