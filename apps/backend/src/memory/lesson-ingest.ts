import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "../db/client.js";

// The structured lesson the vision parse node extracts. Distinct from the Prisma
// model: zod validates the shape of the LLM output, the persistence below maps it
// to the lesson + concept rows. theme is optional light metadata.
export type ExtractedConcept = {
  label: string;
  precisionBar: "exact" | "intermediate" | "global";
  precisionNote: string | null;
};

export type ExtractedLesson = {
  title: string;
  subject: string;
  theme: number | null;
  contentMd: string;
  concepts: ExtractedConcept[];
};

// A decoded source image ready to persist (bytes + its media type).
export type SourceImage = {
  mediaType: string;
  base64: string;
};

// Where source images land on the local volume. Configurable; defaults under the
// backend working directory (gitignored).
function uploadDir(): string {
  return process.env.INGEST_UPLOAD_DIR ?? path.resolve(process.cwd(), ".uploads");
}

// Pure: pulls the media type and base64 payload out of a data URL, or null if it
// is not a base64 data URL. Used to recover the source images from the multimodal
// message blocks (which carry data URLs).
export function parseDataUrl(url: string): SourceImage | null {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(url);
  if (!match || !match[1] || !match[2]) {
    return null;
  }
  return { mediaType: match[1], base64: match[2] };
}

function extensionFor(mediaType: string): string {
  const subtype = mediaType.split("/")[1] ?? "bin";
  return subtype === "jpeg" ? "jpg" : subtype;
}

// Persists a parsed lesson optimistically as a draft: the lesson, its concepts,
// and its source images in one transaction. The source-image bytes are written to
// the local volume first (keyed by the generated lesson id), then their paths are
// recorded. A fresh lesson id is generated up front so the files can be laid out
// before the rows reference them.
export async function persistDraftLesson(
  studentId: string,
  extracted: ExtractedLesson,
  images: SourceImage[],
): Promise<{ lessonId: string }> {
  const lessonId = crypto.randomUUID();
  const lessonDir = path.join(uploadDir(), lessonId);
  if (images.length > 0) {
    await mkdir(lessonDir, { recursive: true });
  }

  const imageRecords = await Promise.all(
    images.map(async (image, ordinal) => {
      const filePath = path.join(lessonDir, `${ordinal}.${extensionFor(image.mediaType)}`);
      await writeFile(filePath, Buffer.from(image.base64, "base64"));
      return { path: filePath, mediaType: image.mediaType, ordinal };
    }),
  );

  await prisma.$transaction(async (tx) => {
    await tx.lesson.create({
      data: {
        id: lessonId,
        studentId,
        subject: extracted.subject,
        title: extracted.title,
        contentMd: extracted.contentMd,
        metadata: extracted.theme !== null ? { theme: extracted.theme } : {},
        concepts: {
          create: extracted.concepts.map((concept) => ({
            label: concept.label,
            precisionBar: concept.precisionBar,
            precisionNote: concept.precisionNote,
          })),
        },
        sourceImages: { create: imageRecords },
      },
    });
  });

  return { lessonId };
}
