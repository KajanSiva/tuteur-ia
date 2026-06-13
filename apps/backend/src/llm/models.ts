import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { initChatModel } from "langchain/chat_models/universal";

// A node never hardcodes a provider/model. It asks for a role; the factory maps
// the role to a concrete model. This is what lets the socratic node run on a
// strong model while classification/evaluation run cheap, and makes the
// cost/quality tradeoff a config change rather than a code change.
export type Role =
  | "classifier"
  | "evaluate"
  | "socratic"
  | "ingest_parse"
  | "session_analysis"
  | "judge";

// Providers initChatModel can target. Each needs its @langchain/<provider>
// package installed; only anthropic is installed today.
export type ModelProvider =
  | "anthropic"
  | "openai"
  | "google-genai"
  | "groq"
  | "mistralai";

export type ModelConfig = {
  provider: ModelProvider;
  model: string;
  temperature: number;
};

// Defaults: cheap models for the constrained/structured roles (classify,
// evaluate), a stronger model for open-ended reasoning (socratic, judge).
// ingest_parse must stay vision-capable (it reads lesson images) — only override
// it to another multimodal model.
const DEFAULTS: Record<Role, ModelConfig> = {
  classifier: { provider: "anthropic", model: "claude-haiku-4-5-20251001", temperature: 0 },
  evaluate: { provider: "anthropic", model: "claude-haiku-4-5-20251001", temperature: 0 },
  socratic: { provider: "anthropic", model: "claude-sonnet-4-6", temperature: 0.7 },
  ingest_parse: { provider: "anthropic", model: "claude-sonnet-4-6", temperature: 0 },
  session_analysis: { provider: "anthropic", model: "claude-sonnet-4-6", temperature: 0 },
  judge: { provider: "anthropic", model: "claude-sonnet-4-6", temperature: 0 },
};

// Resolves a role to its config, applying per-role env overrides:
// LLM_PROVIDER_<ROLE>, LLM_MODEL_<ROLE>, LLM_TEMPERATURE_<ROLE> (role uppercased).
// Pure — the env is injectable so the policy is testable without a live process
// environment.
export function resolveModelConfig(
  role: Role,
  env: NodeJS.ProcessEnv = process.env,
): ModelConfig {
  const base = DEFAULTS[role];
  const key = role.toUpperCase();

  const provider = (env[`LLM_PROVIDER_${key}`] || base.provider) as ModelProvider;
  const model = env[`LLM_MODEL_${key}`] || base.model;

  const tempRaw = env[`LLM_TEMPERATURE_${key}`];
  const temperature =
    tempRaw !== undefined && tempRaw !== "" ? Number(tempRaw) : base.temperature;
  if (Number.isNaN(temperature)) {
    throw new Error(`Invalid LLM_TEMPERATURE_${key}: ${tempRaw}`);
  }

  return { provider, model, temperature };
}

// Provider-agnostic instantiation: initChatModel dynamically loads the resolved
// provider's package and returns a BaseChatModel. Swapping a role's provider is
// a config change (provider + model strings) — no code change in the nodes.
export async function getModel(role: Role): Promise<BaseChatModel> {
  const { provider, model, temperature } = resolveModelConfig(role);
  return initChatModel(model, { modelProvider: provider, temperature });
}
