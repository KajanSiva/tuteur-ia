/*
  Warnings:

  - The primary key for the `concept` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `lesson` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `mastery` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `mastery_history` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `session_trace` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `student` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `student_profile` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `student_profile_history` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Changed the type of `id` on the `concept` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `lesson_id` on the `concept` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `lesson` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `student_id` on the `mastery` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `concept_id` on the `mastery` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `mastery_history` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `student_id` on the `mastery_history` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `concept_id` on the `mastery_history` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `session_trace` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `student_id` on the `session_trace` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `lesson_id` on the `session_trace` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `student` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `student_id` on the `student_profile` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `student_profile_history` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `student_id` on the `student_profile_history` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "concept" DROP CONSTRAINT "concept_lesson_id_fkey";

-- DropForeignKey
ALTER TABLE "mastery" DROP CONSTRAINT "mastery_concept_id_fkey";

-- DropForeignKey
ALTER TABLE "mastery" DROP CONSTRAINT "mastery_student_id_fkey";

-- DropForeignKey
ALTER TABLE "session_trace" DROP CONSTRAINT "session_trace_lesson_id_fkey";

-- DropForeignKey
ALTER TABLE "session_trace" DROP CONSTRAINT "session_trace_student_id_fkey";

-- DropForeignKey
ALTER TABLE "student_profile" DROP CONSTRAINT "student_profile_student_id_fkey";

-- AlterTable
ALTER TABLE "concept" DROP CONSTRAINT "concept_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "lesson_id",
ADD COLUMN     "lesson_id" UUID NOT NULL,
ADD CONSTRAINT "concept_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "lesson" DROP CONSTRAINT "lesson_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
ADD CONSTRAINT "lesson_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "mastery" DROP CONSTRAINT "mastery_pkey",
DROP COLUMN "student_id",
ADD COLUMN     "student_id" UUID NOT NULL,
DROP COLUMN "concept_id",
ADD COLUMN     "concept_id" UUID NOT NULL,
ADD CONSTRAINT "mastery_pkey" PRIMARY KEY ("student_id", "concept_id");

-- AlterTable
ALTER TABLE "mastery_history" DROP CONSTRAINT "mastery_history_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "student_id",
ADD COLUMN     "student_id" UUID NOT NULL,
DROP COLUMN "concept_id",
ADD COLUMN     "concept_id" UUID NOT NULL,
ADD CONSTRAINT "mastery_history_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "session_trace" DROP CONSTRAINT "session_trace_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "student_id",
ADD COLUMN     "student_id" UUID NOT NULL,
DROP COLUMN "lesson_id",
ADD COLUMN     "lesson_id" UUID NOT NULL,
ADD CONSTRAINT "session_trace_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "student" DROP CONSTRAINT "student_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
ADD CONSTRAINT "student_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "student_profile" DROP CONSTRAINT "student_profile_pkey",
DROP COLUMN "student_id",
ADD COLUMN     "student_id" UUID NOT NULL,
ADD CONSTRAINT "student_profile_pkey" PRIMARY KEY ("student_id");

-- AlterTable
ALTER TABLE "student_profile_history" DROP CONSTRAINT "student_profile_history_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "student_id",
ADD COLUMN     "student_id" UUID NOT NULL,
ADD CONSTRAINT "student_profile_history_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE INDEX "mastery_history_student_id_concept_id_version_idx" ON "mastery_history"("student_id", "concept_id", "version");

-- CreateIndex
CREATE INDEX "session_trace_student_id_lesson_id_idx" ON "session_trace"("student_id", "lesson_id");

-- CreateIndex
CREATE INDEX "student_profile_history_student_id_version_idx" ON "student_profile_history"("student_id", "version");

-- AddForeignKey
ALTER TABLE "concept" ADD CONSTRAINT "concept_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastery" ADD CONSTRAINT "mastery_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastery" ADD CONSTRAINT "mastery_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profile" ADD CONSTRAINT "student_profile_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_trace" ADD CONSTRAINT "session_trace_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_trace" ADD CONSTRAINT "session_trace_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
