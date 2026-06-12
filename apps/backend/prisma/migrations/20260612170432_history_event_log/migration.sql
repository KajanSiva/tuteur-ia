/*
  Warnings:

  - You are about to drop the column `valid_from` on the `mastery_history` table. All the data in the column will be lost.
  - You are about to drop the column `valid_to` on the `mastery_history` table. All the data in the column will be lost.
  - You are about to drop the column `valid_from` on the `student_profile_history` table. All the data in the column will be lost.
  - You are about to drop the column `valid_to` on the `student_profile_history` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "mastery_history" DROP COLUMN "valid_from",
DROP COLUMN "valid_to",
ADD COLUMN     "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "student_profile_history" DROP COLUMN "valid_from",
DROP COLUMN "valid_to",
ADD COLUMN     "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
