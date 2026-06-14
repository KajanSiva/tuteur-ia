-- Drop the unused mastery confidence column (write-only, no consumer).
ALTER TABLE "mastery" DROP COLUMN "confidence";
ALTER TABLE "mastery_history" DROP COLUMN "confidence";
