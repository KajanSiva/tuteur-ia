-- Multi-student accounts: parent admin account, per-child credentials, and
-- lessons owned by a student. Pre-existing rows are the POC seed data (one
-- hardcoded student, seeded History lessons); they cannot carry the new
-- required columns and are removed rather than backfilled.
DELETE FROM "lesson";
DELETE FROM "student";

-- AlterTable
ALTER TABLE "lesson" ADD COLUMN     "student_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "student" ADD COLUMN     "password_hash" TEXT NOT NULL,
ADD COLUMN     "username" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "parent" (
    "id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parent_username_key" ON "parent"("username");

-- CreateIndex
CREATE INDEX "lesson_student_id_idx" ON "lesson"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_username_key" ON "student"("username");

-- AddForeignKey
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
