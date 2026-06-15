-- AlterTable
ALTER TABLE "mastery" ADD COLUMN     "last_reviewed_at" TIMESTAMP(3),
ADD COLUMN     "review_step" INTEGER NOT NULL DEFAULT 0;
