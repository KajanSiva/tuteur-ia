import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../db/client.js";
import {
  type ExtractedLesson,
  persistDraftLesson,
  type SourceImage,
} from "./lesson-ingest.js";

const SEED_LESSON_IDS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
];

const UPLOAD_DIR = path.join(tmpdir(), "tuteur-ingest-test");

beforeAll(() => {
  process.env.INGEST_UPLOAD_DIR = UPLOAD_DIR;
});

afterEach(async () => {
  // Remove only the lessons the test created (cascades to concepts + images).
  await prisma.lesson.deleteMany({ where: { id: { notIn: SEED_LESSON_IDS } } });
});

afterAll(async () => {
  await rm(UPLOAD_DIR, { recursive: true, force: true });
  await prisma.$disconnect();
});

function lesson(over: Partial<ExtractedLesson> = {}): ExtractedLesson {
  return {
    title: "Une nouvelle leçon",
    subject: "Histoire",
    theme: 7,
    contentMd: "# Titre\n\nContenu transcrit.",
    concepts: [
      { label: "Concept exact", precisionBar: "exact", precisionNote: "1789" },
      { label: "Concept global", precisionBar: "global", precisionNote: null },
    ],
    ...over,
  };
}

describe("persistDraftLesson", () => {
  it("materialises the lesson with its concepts so they become reviewable", async () => {
    const { lessonId } = await persistDraftLesson(lesson(), []);

    const stored = await prisma.lesson.findUniqueOrThrow({
      where: { id: lessonId },
      include: { concepts: { orderBy: { label: "asc" } } },
    });
    expect(stored.title).toBe("Une nouvelle leçon");
    expect(stored.contentMd).toContain("Contenu transcrit");
    expect(stored.metadata).toEqual({ theme: 7 });
    expect(stored.concepts.map((c) => c.label)).toEqual([
      "Concept exact",
      "Concept global",
    ]);
    expect(stored.concepts.map((c) => c.precisionBar)).toEqual([
      "exact",
      "global",
    ]);
  });

  it("omits theme metadata when none was extracted", async () => {
    const { lessonId } = await persistDraftLesson(lesson({ theme: null }), []);
    const stored = await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } });
    expect(stored.metadata).toEqual({});
  });

  it("writes each source image to disk and records its path in order", async () => {
    const images: SourceImage[] = [
      { mediaType: "image/png", base64: Buffer.from("page-one").toString("base64") },
      { mediaType: "image/jpeg", base64: Buffer.from("page-two").toString("base64") },
    ];
    const { lessonId } = await persistDraftLesson(lesson(), images);

    const rows = await prisma.lessonSourceImage.findMany({
      where: { lessonId },
      orderBy: { ordinal: "asc" },
    });
    expect(rows.map((r) => r.ordinal)).toEqual([0, 1]);
    expect(rows.map((r) => r.mediaType)).toEqual(["image/png", "image/jpeg"]);

    const firstRow = rows[0];
    if (!firstRow) throw new Error("expected a persisted image row");
    const onDisk = await readFile(firstRow.path);
    expect(onDisk.toString()).toBe("page-one");
  });
});
