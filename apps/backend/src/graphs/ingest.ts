import {
  AIMessage,
  type BaseMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { END } from "@langchain/langgraph";
import { z } from "zod";

import { prisma } from "../db/client.js";
import { getModel } from "../llm/models.js";
import {
  type ExtractedLesson,
  parseDataUrl,
  persistDraftLesson,
  type SourceImage,
} from "../memory/lesson-ingest.js";

// Structured extraction the vision parse node emits. zod validates the shape of
// the model's output; the persistence layer maps it to lesson + concept rows.
export const ExtractedLessonSchema = z.object({
  title: z.string().min(1).describe("Titre de la leçon."),
  subject: z.string().min(1).describe("Matière (ex. « Histoire »)."),
  theme: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe("Numéro de thème si visible, sinon null."),
  contentMd: z
    .string()
    .min(1)
    .describe("La leçon transcrite fidèlement en Markdown."),
  concepts: z
    .array(
      z.object({
        label: z.string().min(1).describe("Le concept enseignable, court."),
        precisionBar: z
          .enum(["exact", "intermediate", "global"])
          .describe(
            "exact = fait précis (date, nom) ; intermediate = explication avec ses mots ; global = idée générale.",
          ),
        precisionNote: z
          .string()
          .nullable()
          .optional()
          .describe("Précision attendue (ex. la date), sinon null."),
      }),
    )
    .min(1)
    .describe("Les concepts enseignables de la leçon."),
});

type ParsedLesson = z.infer<typeof ExtractedLessonSchema>;

// Normalises the parsed payload to the persistence type (optional → null).
function toExtractedLesson(parsed: ParsedLesson): ExtractedLesson {
  return {
    title: parsed.title,
    subject: parsed.subject,
    theme: parsed.theme ?? null,
    contentMd: parsed.contentMd,
    concepts: parsed.concepts.map((concept) => ({
      label: concept.label,
      precisionBar: concept.precisionBar,
      precisionNote: concept.precisionNote ?? null,
    })),
  };
}

// The slice of graph state the ingest flow reads and writes.
export type IngestState = {
  messages: BaseMessage[];
  pendingIngestion: ExtractedLesson | null;
};

// Pulls the source images back out of the multimodal message blocks. toBaseMessages
// turns file parts into `image_url` blocks carrying data URLs; we scan the last
// human message and decode them (lesson order = block order).
export function extractSourceImages(messages: BaseMessage[]): SourceImage[] {
  const lastHuman = [...messages]
    .reverse()
    .find((message) => message.getType() === "human");
  if (!lastHuman || typeof lastHuman.content === "string") {
    return [];
  }
  const images: SourceImage[] = [];
  for (const block of lastHuman.content) {
    if (
      block &&
      typeof block === "object" &&
      "type" in block &&
      block.type === "image_url"
    ) {
      const url = (block as { image_url?: { url?: string } }).image_url?.url;
      const decoded = url ? parseDataUrl(url) : null;
      if (decoded) {
        images.push(decoded);
      }
    }
  }
  return images;
}

const PARSE_SYSTEM = `Tu analyses la ou les photos d'une leçon d'école primaire (CM2, Histoire) envoyées par une élève.
Transcris fidèlement la leçon en Markdown (contentMd), sans rien inventer ni résumer.
Puis dégage les concepts enseignables : pour chacun, un libellé court, une barre de précision (exact / intermediate / global) et, si pertinent, la précision attendue (une date, un nom).
Si plusieurs pages sont fournies, elles forment UNE seule leçon dans l'ordre.`;

// Vision extraction node. Same bindTools pattern as the other structured nodes
// (a tool_use block, not visible text) so it stays internal under streamMode
// messages. No image → ask for a photo; a malformed extraction → ask to retry.
export async function parseLessonNode(
  state: IngestState,
): Promise<Partial<IngestState>> {
  const images = extractSourceImages(state.messages);
  if (images.length === 0) {
    return {
      messages: [
        new AIMessage(
          "Envoie-moi une ou plusieurs photos de ta leçon et je la prendrai en compte.",
        ),
      ],
      pendingIngestion: null,
    };
  }

  const base = await getModel("ingest_parse");
  if (!base.bindTools) {
    throw new Error("ingest_parse model does not support tool calling");
  }
  const model = base.bindTools(
    [
      {
        name: "enregistrer_lecon",
        description: "Enregistre la leçon transcrite et ses concepts.",
        schema: ExtractedLessonSchema,
      },
    ],
    { tool_choice: "enregistrer_lecon" },
  );
  const response = await model.invoke([
    new SystemMessage(PARSE_SYSTEM),
    ...state.messages,
  ]);

  const parsed = ExtractedLessonSchema.safeParse(response.tool_calls?.[0]?.args);
  if (!parsed.success) {
    return {
      messages: [
        new AIMessage(
          "Je n'ai pas réussi à lire cette leçon. Tu peux renvoyer une photo plus nette ?",
        ),
      ],
      pendingIngestion: null,
    };
  }
  return { pendingIngestion: toExtractedLesson(parsed.data) };
}

// Routes out of parse: a successful extraction proceeds to persistence; anything
// else has already emitted its message and ends the turn.
export function afterParse(
  state: IngestState,
): "ingestPersist" | typeof END {
  return state.pendingIngestion ? "ingestPersist" : END;
}

// Deterministic persistence: writes the lesson draft (lesson + concepts + source
// images) optimistically. The recap that follows is the safety net for any
// extraction error (the child corrects by re-ingesting).
export async function persistDraftNode(
  state: IngestState,
): Promise<Partial<IngestState>> {
  if (!state.pendingIngestion) {
    return {};
  }
  const images = extractSourceImages(state.messages);
  await persistDraftLesson(state.pendingIngestion, images);
  return {};
}

// The tutor role for the recap: a warm, child-facing confirmation that invites
// correction (the safety net for extraction errors).
export function buildRecapSystem(displayName: string): string {
  return [
    `Tu es un tuteur d'histoire bienveillant pour ${displayName} (CM2). Elle vient de t'envoyer une nouvelle leçon en photo, que tu as lue.`,
    "Confirme-lui chaleureusement et brièvement ce que tu as compris (le titre et les grands points), en deux ou trois phrases, puis demande-lui si c'est bien ça ou s'il faut corriger.",
    "Ne récite pas toute la leçon ; reste simple et encourageant.",
  ].join("\n");
}

// The extracted lesson as the input the tutor reacts to. Kept as a human turn so
// the model has a non-system message (Anthropic requires one); the images are not
// re-sent (cost).
export function buildRecapInput(extracted: ExtractedLesson): string {
  const concepts = extracted.concepts
    .map((concept) => `- ${concept.label}`)
    .join("\n");
  return [
    `Voici la leçon que je viens de lire depuis ses photos.`,
    `Titre : « ${extracted.title} ».`,
    `Concepts repérés :`,
    concepts,
    "",
    "Confirme-moi ce que tu as compris.",
  ].join("\n");
}

// User-facing prose recap, streamed. Reads the just-persisted extraction from
// state and clears it so the next turn re-enters cleanly through the router.
export async function recapNode(
  state: IngestState,
): Promise<Partial<IngestState>> {
  const extracted = state.pendingIngestion;
  if (!extracted) {
    return {};
  }
  const student = await prisma.student.findFirstOrThrow({
    orderBy: { createdAt: "asc" },
  });
  const model = await getModel("socratic");
  const response = await model.invoke([
    new SystemMessage(buildRecapSystem(student.displayName)),
    new HumanMessage(buildRecapInput(extracted)),
  ]);
  return { messages: [response], pendingIngestion: null };
}
