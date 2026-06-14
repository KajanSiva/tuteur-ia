import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

// The checkpointer's tables live in their own Postgres schema, NOT in `public`.
// LangGraph manages these tables itself (setup() + its own checkpoint_migrations
// versioning); Prisma owns `public`. Keeping them in separate schemas stops
// Prisma's migrate from seeing LangGraph's tables as drift (which would make it
// offer a destructive reset). The two migration systems never overlap.
const CHECKPOINT_SCHEMA = "langgraph";

// The checkpointer persists the parent graph's state per thread_id: it is what
// turns a stateless POST into a stateful revision session (the concept queue,
// cursor and transcript survive between turns). The brief keeps it on the parent
// graph only; subgraphs inherit it.
//
// Tests use an in-memory saver (see test helpers), so this module owns only the
// durable Postgres backing used by the running server.
export async function createCheckpointer(): Promise<BaseCheckpointSaver> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for the Postgres checkpointer");
  }
  const saver = PostgresSaver.fromConnString(connectionString, {
    schema: CHECKPOINT_SCHEMA,
  });
  // Creates the schema and the checkpointer's own tables if absent (idempotent).
  await saver.setup();
  return saver;
}
