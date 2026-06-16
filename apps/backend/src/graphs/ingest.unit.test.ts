import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { END } from "@langchain/langgraph";
import { describe, expect, it } from "vitest";

import type { ExtractedLesson } from "../memory/lesson-ingest.js";
import {
  afterParse,
  buildRecapInput,
  buildRecapSystem,
  extractSourceImages,
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

describe("afterParse", () => {
  const lesson: ExtractedLesson = {
    title: "T",
    subject: "Histoire",
    theme: null,
    contentMd: "c",
    concepts: [{ label: "x", precisionBar: "exact", precisionNote: null }],
  };

  it("proceeds to persistence on a successful extraction", () => {
    expect(afterParse({ messages: [], pendingIngestion: lesson })).toBe(
      "ingestPersist",
    );
  });

  it("ends the turn when nothing was extracted", () => {
    expect(afterParse({ messages: [], pendingIngestion: null })).toBe(END);
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
