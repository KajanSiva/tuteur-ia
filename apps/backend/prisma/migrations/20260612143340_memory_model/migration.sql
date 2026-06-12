-- CreateEnum
CREATE TYPE "PrecisionBar" AS ENUM ('exact', 'intermediate', 'global');

-- CreateEnum
CREATE TYPE "MasteryLevel" AS ENUM ('emerging', 'developing', 'secure');

-- CreateEnum
CREATE TYPE "MemoryOp" AS ENUM ('add', 'update', 'delete', 'noop');

-- CreateTable
CREATE TABLE "lesson" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content_md" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concept" (
    "id" TEXT NOT NULL,
    "lesson_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "precision_bar" "PrecisionBar" NOT NULL,
    "precision_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mastery" (
    "student_id" TEXT NOT NULL,
    "concept_id" TEXT NOT NULL,
    "level" "MasteryLevel" NOT NULL,
    "rationale" TEXT,
    "confidence" DOUBLE PRECISION,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "changed_by" TEXT NOT NULL,
    "run_id" TEXT,
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mastery_pkey" PRIMARY KEY ("student_id","concept_id")
);

-- CreateTable
CREATE TABLE "mastery_history" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "concept_id" TEXT NOT NULL,
    "level" "MasteryLevel" NOT NULL,
    "rationale" TEXT,
    "confidence" DOUBLE PRECISION,
    "is_locked" BOOLEAN NOT NULL,
    "version" INTEGER NOT NULL,
    "changed_by" TEXT NOT NULL,
    "run_id" TEXT,
    "op" "MemoryOp" NOT NULL,
    "reason" TEXT,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mastery_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_profile" (
    "student_id" TEXT NOT NULL,
    "learning_style" TEXT,
    "motivation_levers" TEXT,
    "friction_to_avoid" TEXT,
    "is_locked" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "changed_by" TEXT NOT NULL,
    "run_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_profile_pkey" PRIMARY KEY ("student_id")
);

-- CreateTable
CREATE TABLE "student_profile_history" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "learning_style" TEXT,
    "motivation_levers" TEXT,
    "friction_to_avoid" TEXT,
    "version" INTEGER NOT NULL,
    "changed_by" TEXT NOT NULL,
    "run_id" TEXT,
    "op" "MemoryOp" NOT NULL,
    "reason" TEXT,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_profile_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_trace" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "lesson_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "transcript" JSONB NOT NULL DEFAULT '[]',
    "summary" TEXT,
    "extraction" JSONB,

    CONSTRAINT "session_trace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mastery_history_student_id_concept_id_version_idx" ON "mastery_history"("student_id", "concept_id", "version");

-- CreateIndex
CREATE INDEX "student_profile_history_student_id_version_idx" ON "student_profile_history"("student_id", "version");

-- CreateIndex
CREATE INDEX "session_trace_student_id_lesson_id_idx" ON "session_trace"("student_id", "lesson_id");

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
