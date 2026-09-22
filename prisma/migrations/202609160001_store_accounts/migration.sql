CREATE TABLE store_accounts (
 id UUID PRIMARY KEY,
 email TEXT NOT NULL UNIQUE CHECK (email = lower(trim(email))),
 "customerId" UUID NOT NULL UNIQUE REFERENCES customers(id) ON DELETE RESTRICT,
 "verifiedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE TABLE store_challenges (
 id UUID PRIMARY KEY,
 email TEXT NOT NULL UNIQUE CHECK (email = lower(trim(email))),
 "codeHash" TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 5),
 "expiresAt" TIMESTAMPTZ(3) NOT NULL,
 "sentAt" TIMESTAMPTZ(3),
 "usedAt" TIMESTAMPTZ(3),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX store_challenges_expiration ON store_challenges("expiresAt");
CREATE TABLE store_sessions (
 id UUID PRIMARY KEY,
 "tokenHash" TEXT NOT NULL UNIQUE,
 "accountId" UUID NOT NULL REFERENCES store_accounts(id) ON DELETE RESTRICT,
 "expiresAt" TIMESTAMPTZ(3) NOT NULL,
 "revokedAt" TIMESTAMPTZ(3),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX store_sessions_account ON store_sessions("accountId");
CREATE INDEX store_sessions_expiration ON store_sessions("expiresAt");
