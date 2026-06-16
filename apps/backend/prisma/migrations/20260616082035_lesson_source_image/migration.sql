-- CreateTable
CREATE TABLE "lesson_source_image" (
    "id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "path" TEXT NOT NULL,
    "media_type" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_source_image_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lesson_source_image_lesson_id_ordinal_key" ON "lesson_source_image"("lesson_id", "ordinal");

-- AddForeignKey
ALTER TABLE "lesson_source_image" ADD CONSTRAINT "lesson_source_image_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
