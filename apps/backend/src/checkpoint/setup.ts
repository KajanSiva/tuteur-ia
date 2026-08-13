import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

const CHECKPOINT_SCHEMA = "langgraph";
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to initialize the checkpointer");
}

const saver = PostgresSaver.fromConnString(connectionString, {
  schema: CHECKPOINT_SCHEMA,
});

try {
  await saver.setup();
  console.info("LangGraph checkpoint schema is ready");
} finally {
  await saver.end();
}
