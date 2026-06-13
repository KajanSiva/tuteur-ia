import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { afterEach, describe, expect, it } from "vitest";

import { getModel, resolveModelConfig } from "./models.js";

describe("resolveModelConfig", () => {
  it("maps constrained roles to a cheap model at temperature 0", () => {
    const env = {} as NodeJS.ProcessEnv;
    expect(resolveModelConfig("classifier", env)).toEqual({
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      temperature: 0,
    });
    expect(resolveModelConfig("evaluate", env).model).toBe(
      "claude-haiku-4-5-20251001",
    );
  });

  it("maps the open-ended socratic role to a stronger model with warmth", () => {
    const config = resolveModelConfig("socratic", {} as NodeJS.ProcessEnv);
    expect(config.model).toBe("claude-sonnet-4-6");
    expect(config.temperature).toBe(0.7);
  });

  it("lets env override the model per role without touching others", () => {
    const env = { LLM_MODEL_SOCRATIC: "claude-opus-4-8" } as NodeJS.ProcessEnv;
    expect(resolveModelConfig("socratic", env).model).toBe("claude-opus-4-8");
    expect(resolveModelConfig("classifier", env).model).toBe(
      "claude-haiku-4-5-20251001",
    );
  });

  it("lets env override the temperature per role", () => {
    const env = { LLM_TEMPERATURE_SOCRATIC: "0.2" } as NodeJS.ProcessEnv;
    expect(resolveModelConfig("socratic", env).temperature).toBe(0.2);
  });

  it("lets env override the provider per role (multi-provider seam)", () => {
    const env = {
      LLM_PROVIDER_JUDGE: "openai",
      LLM_MODEL_JUDGE: "gpt-5",
    } as NodeJS.ProcessEnv;
    const config = resolveModelConfig("judge", env);
    expect(config.provider).toBe("openai");
    expect(config.model).toBe("gpt-5");
  });

  it("rejects a non-numeric temperature override", () => {
    const env = { LLM_TEMPERATURE_JUDGE: "hot" } as NodeJS.ProcessEnv;
    expect(() => resolveModelConfig("judge", env)).toThrow(
      /Invalid LLM_TEMPERATURE_JUDGE/,
    );
  });
});

describe("getModel", () => {
  const prevKey = process.env.ANTHROPIC_API_KEY;
  afterEach(() => {
    if (prevKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = prevKey;
  });

  it("instantiates a usable chat model for a role", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const model = await getModel("socratic");
    expect(model).toBeInstanceOf(BaseChatModel);
    expect(typeof model.withStructuredOutput).toBe("function");
    expect(typeof model.stream).toBe("function");
  });
});
