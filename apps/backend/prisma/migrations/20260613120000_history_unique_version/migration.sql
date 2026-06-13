-- DropIndex
DROP INDEX "mastery_history_student_id_concept_id_version_idx";

-- DropIndex
DROP INDEX "student_profile_history_student_id_version_idx";

-- CreateIndex
CREATE UNIQUE INDEX "mastery_history_student_id_concept_id_version_key" ON "mastery_history"("student_id", "concept_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "student_profile_history_student_id_version_key" ON "student_profile_history"("student_id", "version");
