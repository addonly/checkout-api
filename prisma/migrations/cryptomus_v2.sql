-- Migration: Cryptomus V2 - Add new columns and tables (camelCase column names)

-- ── Orders: new fields ─────────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "packageNameSnapshot" TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "referencePrice" NUMERIC(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "referenceCurrency" TEXT DEFAULT 'USD';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMPTZ;
ALTER TABLE orders ALTER COLUMN "productId" DROP NOT NULL;

-- ── CryptoPayments: expand with new fields ─────────────────────────
ALTER TABLE crypto_payments ADD COLUMN IF NOT EXISTS "cryptomusUuid" TEXT;
ALTER TABLE crypto_payments ADD COLUMN IF NOT EXISTS "cryptomusOrderId" TEXT;
ALTER TABLE crypto_payments ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE crypto_payments ADD COLUMN IF NOT EXISTS "payerCurrency" TEXT;
ALTER TABLE crypto_payments ADD COLUMN IF NOT EXISTS "payerCurrencyRate" TEXT;
ALTER TABLE crypto_payments ADD COLUMN IF NOT EXISTS "invoiceAmount" NUMERIC(20,8);
ALTER TABLE crypto_payments ADD COLUMN IF NOT EXISTS "payerAmount" NUMERIC(20,8);
ALTER TABLE crypto_payments ADD COLUMN IF NOT EXISTS "paymentAmount" NUMERIC(20,8);
ALTER TABLE crypto_payments ADD COLUMN IF NOT EXISTS "merchantAmount" NUMERIC(20,8);
ALTER TABLE crypto_payments ADD COLUMN IF NOT EXISTS "fromAddress" TEXT;
ALTER TABLE crypto_payments ADD COLUMN IF NOT EXISTS "isFinal" BOOLEAN DEFAULT FALSE;
ALTER TABLE crypto_payments ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMPTZ;
ALTER TABLE crypto_payments ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMPTZ;
ALTER TABLE crypto_payments ADD COLUMN IF NOT EXISTS "qrCode" TEXT;

-- Make providerStatus TEXT if it was enum
ALTER TABLE crypto_payments ALTER COLUMN "providerStatus" TYPE TEXT USING "providerStatus"::TEXT;

-- ── PaymentIntent: new table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_intents (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "publicId"        TEXT UNIQUE NOT NULL,
  "orderId"         TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method            TEXT NOT NULL DEFAULT 'CRYPTO',
  "enteredAmount"   NUMERIC(10,2) NOT NULL,
  "baseCurrency"    TEXT NOT NULL DEFAULT 'USD',
  "selectedCrypto"  TEXT,
  "selectedNetwork" TEXT,
  status            TEXT NOT NULL DEFAULT 'DRAFT',
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── WebhookEvents: expand fields ───────────────────────────────────
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'cryptomus';
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS "providerStatus" TEXT;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS "payloadJson" JSONB;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS "receivedAt" TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS "processedAt" TIMESTAMPTZ;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS "cryptoPaymentId" TEXT;

-- Copy existing payload data if column exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='webhook_events' AND column_name='payload') THEN
    UPDATE webhook_events SET "payloadJson" = payload WHERE "payloadJson" IS NULL;
  END IF;
END
$$;
