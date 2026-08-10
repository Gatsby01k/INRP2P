-- Persist the partner's selected commercial program so reserve thresholds are
-- enforced consistently across sessions and cannot be changed client-side.

CREATE TYPE "PartnerProgramLevel" AS ENUM ('STARTER', 'VERIFIED', 'PRO', 'PRIME');

ALTER TABLE "PartnerProfile"
ADD COLUMN "programLevel" "PartnerProgramLevel" NOT NULL DEFAULT 'STARTER';

