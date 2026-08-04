import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { END } from "@langchain/langgraph";
import { describe, expect, it } from "vitest";

import type { ExtractedLesson } from "../memory/lesson-ingest.js";
import {
  afterConfirm,
  afterDetect,
  afterParse,
  buildRecapActions,
  buildRecapInput,
  buildRecapSystem,
  extractSourceImages,
  type IngestState,
} from "./ingest.js";

function imageBlock(url: string) {
  return { type: "image_url", image_url: { url } };
}

describe("extractSourceImages", () => {
  it("decodes image_url data-url blocks of the last human message, in order", () => {
    const messages = [
      new HumanMessage({
        content: [
          { type: "text", text: "voici ma leçon" },
          imageBlock("data:image/png;base64,AAAA"),
          imageBlock("data:image/jpeg;base64,BBBB"),
        ],
      }),
    ];
    expect(extractSourceImages(messages)).toEqual([
      { mediaType: "image/png", base64: "AAAA" },
      { mediaType: "image/jpeg", base64: "BBBB" },
    ]);
  });

  it("returns no image for a plain-text message", () => {
    expect(extractSourceImages([new HumanMessage("juste du texte")])).toEqual([]);
  });

  it("ignores non-data image urls (nothing to persist)", () => {
    const messages = [
      new HumanMessage({
        content: [imageBlock("https://example.com/lesson.png")],
      }),
    ];
    expect(extractSourceImages(messages)).toEqual([]);
  });

  it("reads the latest human message, not an earlier one", () => {
    const messages = [
      new HumanMessage({ content: [imageBlock("data:image/png;base64,OLD")] }),
      new SystemMessage("..."),
      new HumanMessage({ content: [imageBlock("data:image/png;base64,NEW")] }),
    ];
    expect(extractSourceImages(messages)).toEqual([
      { mediaType: "image/png", base64: "NEW" },
    ]);
  });
});

function ingestState(over: Partial<IngestState> = {}): IngestState {
  return {
    messages: [],
    studentId: "s",
    pendingIngestion: null,
    ingestedLessonId: null,
    collision: null,
    overwriteChoice: null,
    ...over,
  };
}

describe("afterParse", () => {
  const lesson: ExtractedLesson = {
    title: "T",
    subject: "Histoire",
    theme: null,
    contentMd: "c",
    concepts: [{ label: "x", precisionBar: "exact", precisionNote: null }],
  };

  it("proceeds to collision detection on a successful extraction", () => {
    expect(afterParse(ingestState({ pendingIngestion: lesson }))).toBe(
      "ingestDetect",
    );
  });

  it("ends the turn when nothing was extracted", () => {
    expect(afterParse(ingestState())).toBe(END);
  });
});

describe("afterDetect", () => {
  it("routes a collision to the confirmation gate", () => {
    expect(
      afterDetect(ingestState({ collision: { lessonId: "l1", title: "X" } })),
    ).toBe("ingestConfirm");
  });

  it("persists directly when the lesson is new", () => {
    expect(afterDetect(ingestState())).toBe("ingestPersist");
  });
});

describe("afterConfirm", () => {
  it("cancels on the cancel choice (existing lesson untouched)", () => {
    expect(afterConfirm(ingestState({ overwriteChoice: "cancel" }))).toBe(
      "ingestCancel",
    );
  });

  it("persists on replace", () => {
    expect(afterConfirm(ingestState({ overwriteChoice: "replace" }))).toBe(
      "ingestPersist",
    );
  });

  it("persists on keep_both", () => {
    expect(afterConfirm(ingestState({ overwriteChoice: "keep_both" }))).toBe(
      "ingestPersist",
    );
  });
});

describe("recap prompts", () => {
  const extracted: ExtractedLesson = {
    title: "La Révolution",
    subject: "Histoire",
    theme: 3,
    contentMd: "...",
    concepts: [
      { label: "1789", precisionBar: "exact", precisionNote: null },
      { label: "Bastille", precisionBar: "global", precisionNote: null },
    ],
  };

  it("addresses the student by name in the system role", () => {
    expect(buildRecapSystem("Camille")).toContain("Camille");
  });

  it("surfaces the title and each concept label in the input turn", () => {
    const input = buildRecapInput(extracted);
    expect(input).toContain("La Révolution");
    expect(input).toContain("1789");
    expect(input).toContain("Bastille");
  });
});

describe("buildRecapActions", () => {
  it("offers revising the just-ingested lesson (carrying its id) and adding another", () => {
    const actions = buildRecapActions("lesson-42");
    expect(actions).toEqual([
      {
        label: "Réviser cette leçon",
        command: { kind: "revise_lesson", lessonId: "lesson-42" },
      },
      { label: "Ajouter une autre leçon", command: { kind: "add_lesson" } },
    ]);
  });
});
