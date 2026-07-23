// Shared contracts between backend & frontend.
import type { UIMessage } from "ai";

// Closed intent enum — the router's classification target.
// out_of_scope is the guardrail against generic-ChatGPT drift (it also absorbs
// stray off-lesson questions).
export const INTENTS = ["ingest", "revise", "out_of_scope"] as const;
export type Intent = (typeof INTENTS)[number];

// The choice a hard-gate overwrite confirmation resolves to.
export type OverwriteChoice = "replace" | "keep_both" | "cancel";

// A structured command a chip carries. Tapping a chip dispatches one of these —
// a deterministic intent, never free text the router has to re-classify (brief
// §17: "input mode follows conversational state"). add_lesson is handled on the
// front (opens the picker); revise_lesson round-trips to the backend;
// resume_overwrite answers a pending HIL interrupt (brief §5.5/§6).
export type ActionCommand =
  | { kind: "revise_lesson"; lessonId: string }
  | { kind: "add_lesson" }
  | { kind: "resume_overwrite"; choice: OverwriteChoice };

export type ChipAction = { label: string; command: ActionCommand };

// Payload of the hard-gate overwrite confirmation (interrupt → data-confirm).
// The kind tells the front which card to render; options are the labelled
// choices. Surfaced when an ingested lesson collides with an existing one.
export type ConfirmOverwrite = {
  kind: "confirm_overwrite";
  title: string;
  options: Array<{ label: string; choice: OverwriteChoice }>;
};

// Custom (non-prose) data parts the backend streams alongside text. Each key K
// surfaces as a `data-K` UI part whose `.data` is the value type here. Emitted
// from graph nodes via the LangGraph custom stream; the adapter maps them to
// `data-<type>` parts. Centralised so the front and back share one contract.
export type TutorDataParts = {
  // Transient progress signal (e.g. the slow vision parse). No id → not persisted.
  progress: { message: string };
  // Bounded affordances rendered as tappable chips. Persisted (has an id).
  actions: { actions: ChipAction[] };
  // Hard-gate confirmation (HIL): rendered as a blocking card; input disabled.
  confirm: ConfirmOverwrite;
};

// Central app message type for useChat and the streaming seam.
export type TutorUIMessage = UIMessage<unknown, TutorDataParts>;

// --- Auth & family-admin contracts -----------------------------------------

export type AuthRole = "parent" | "child";

// The signed-in identity as the API reports it. gradeLevel is present for
// children only (it calibrates the tutor).
export type AuthUser = {
  role: AuthRole;
  id: string;
  displayName: string;
  gradeLevel?: string;
};

// initialized = a parent account exists; false drives the onboarding flow.
export type AuthState = { initialized: boolean; user: AuthUser | null };

// Per-lesson mastery rollup for the parent view. Unseen concepts are the
// remainder: conceptCount - secureCount - inProgressCount.
export type LessonOverview = {
  id: string;
  title: string;
  subject: string;
  conceptCount: number;
  secureCount: number;
  inProgressCount: number;
};

export type ChildOverview = {
  id: string;
  displayName: string;
  username: string;
  gradeLevel: string;
  age: number | null;
  lessons: LessonOverview[];
};
