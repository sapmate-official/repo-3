-- Additive auth session tables. Safe to run against a clone of production.
CREATE TABLE IF NOT EXISTS "AuthSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "orgId" TEXT,
  "familyId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userAgent" TEXT,
  "ipAddress" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "replacedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");
CREATE INDEX IF NOT EXISTS "AuthSession_userId_revokedAt_idx" ON "AuthSession"("userId", "revokedAt");
CREATE INDEX IF NOT EXISTS "AuthSession_familyId_idx" ON "AuthSession"("familyId");
CREATE INDEX IF NOT EXISTS "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

DO $$
BEGIN
  ALTER TABLE "AuthSession"
    ADD CONSTRAINT "AuthSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SuperAdminAuthSession" (
  "id" TEXT NOT NULL,
  "superAdminId" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userAgent" TEXT,
  "ipAddress" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "replacedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SuperAdminAuthSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SuperAdminAuthSession_tokenHash_key" ON "SuperAdminAuthSession"("tokenHash");
CREATE INDEX IF NOT EXISTS "SuperAdminAuthSession_superAdminId_revokedAt_idx" ON "SuperAdminAuthSession"("superAdminId", "revokedAt");
CREATE INDEX IF NOT EXISTS "SuperAdminAuthSession_familyId_idx" ON "SuperAdminAuthSession"("familyId");
CREATE INDEX IF NOT EXISTS "SuperAdminAuthSession_expiresAt_idx" ON "SuperAdminAuthSession"("expiresAt");

DO $$
BEGIN
  ALTER TABLE "SuperAdminAuthSession"
    ADD CONSTRAINT "SuperAdminAuthSession_superAdminId_fkey"
    FOREIGN KEY ("superAdminId") REFERENCES "SuperAdmin"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
