-- CreateTable
CREATE TABLE "student" (
    "id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "grade_level" TEXT NOT NULL,
    "age" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_pkey" PRIMARY KEY ("id")
);
