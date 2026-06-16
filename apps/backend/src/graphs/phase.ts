// The single routing discriminant the START router (routeStart) switches on. It
// replaces the scattered reviseActive / pendingLessonChoice / enterReviseLessonId
// booleans: one field, mutually-exclusive values, an exhaustive switch. Because a
// turn is in exactly one phase, a stale flag can no longer override an active
// session — that whole class of bug is gone by construction.
export type RoutingPhase =
  // No flow in progress → classify the next message.
  | "idle"
  // A revise session is live → the next message is the student's answer.
  | "revising"
  // We asked which lesson → the next message is that choice (skip classify).
  | "choosing_lesson"
  // A chip set the lesson → enter revise directly (bypass classify + resolver).
  | "entering_revise";
