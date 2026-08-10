-- ═══════════════════════════════════════════════════════
--  CHECKOUT — Migration Inicial
--  Corre este SQL no Supabase SQL Editor:
--  https://supabase.com/dashboard/project/pwhpahcwbtmvzaqtscsn/sql/new
-- ═══════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('VOUCHER', 'CRYPTO');
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAYMENT_SUBMITTED', 'PAYMENT_CONFIRMED', 'UNDER_REVIEW', 'APPROVED', 'DELIVERED', 'REJECTED', 'EXPIRED', 'REFUNDED');
CREATE TYPE "VoucherProvider" AS ENUM ('G2A', 'ENEBA', 'MANUAL');
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'MANUAL_REVIEW', 'VERIFIED', 'REJECTED', 'DUPLICATE');
CREATE TYPE "CryptoPaymentStatus" AS ENUM ('CREATED', 'PENDING', 'PAID', 'PAID_OVER', 'WRONG_AMOUNT', 'PROCESS', 'CONFIRM_CHECK', 'WRONG_AMOUNT_WAITING', 'CHECK', 'FAIL', 'CANCEL', 'SYSTEM_FAIL', 'REFUND_PROCESS', 'REFUND_FAIL', 'REFUND_PAID');
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'REVIEWER', 'SUPPORT');

-- CreateTable
CREATE TABLE IF NOT EXISTS "products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "orders" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paymentMethod" "PaymentMethod" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "customerEmail" TEXT,
    "customerIp" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "voucher_submissions" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" "VoucherProvider" NOT NULL,
    "codeLast4" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "codeCiphertext" TEXT NOT NULL,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verificationNotes" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    CONSTRAINT "voucher_submissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "crypto_payments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "providerUuid" TEXT NOT NULL,
    "invoiceUrl" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "network" TEXT,
    "txid" TEXT,
    "providerStatus" "CryptoPaymentStatus" NOT NULL DEFAULT 'CREATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "crypto_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "webhook_events" (
    "id" TEXT NOT NULL,
    "eventHash" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'cryptomus',
    "cryptoPaymentId" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,
    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "admin_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'REVIEWER',
    "twoFaSecret" TEXT,
    "twoFaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "orderId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "ip" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "products_slug_key" ON "products"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "orders_publicId_key" ON "orders"("publicId");
CREATE INDEX IF NOT EXISTS "orders_status_idx" ON "orders"("status");
CREATE INDEX IF NOT EXISTS "orders_createdAt_idx" ON "orders"("createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "voucher_submissions_orderId_key" ON "voucher_submissions"("orderId");
CREATE UNIQUE INDEX IF NOT EXISTS "voucher_submissions_codeHash_key" ON "voucher_submissions"("codeHash");
CREATE UNIQUE INDEX IF NOT EXISTS "crypto_payments_orderId_key" ON "crypto_payments"("orderId");
CREATE UNIQUE INDEX IF NOT EXISTS "crypto_payments_providerUuid_key" ON "crypto_payments"("providerUuid");
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_events_eventHash_key" ON "webhook_events"("eventHash");
CREATE UNIQUE INDEX IF NOT EXISTS "admin_users_email_key" ON "admin_users"("email");
CREATE INDEX IF NOT EXISTS "audit_logs_adminId_idx" ON "audit_logs"("adminId");
CREATE INDEX IF NOT EXISTS "audit_logs_orderId_idx" ON "audit_logs"("orderId");
CREATE INDEX IF NOT EXISTS "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- Foreign Keys
ALTER TABLE "orders" ADD CONSTRAINT "orders_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "voucher_submissions" ADD CONSTRAINT "voucher_submissions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "crypto_payments" ADD CONSTRAINT "crypto_payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_cryptoPaymentId_fkey" FOREIGN KEY ("cryptoPaymentId") REFERENCES "crypto_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
