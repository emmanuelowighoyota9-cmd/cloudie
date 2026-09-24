"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { vly } from "../lib/vly-integrations";
import {
  buildAiSystemPrompt,
  buildAiUserPrompt,
  coerceAndValidateAiJson,
  classifyAndExtract,
  type ClassifierInput,
} from "../lib/cloudieClassifier";

/**
 * AI Template Classification — Convex Node action.
 *
 * Calls the Vly AI gateway (gpt-4o-mini) with the strict 4-category
 * taxonomy and JSON schema. On any failure (no key, gateway error,
 * invalid JSON) it falls back deterministically so the admin never
 * gets a dead end.
 */
export const classifyWithAi = action({
  args: {
    templateTitle: v.optional(v.string()),
    name: v.optional(v.string()),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    slug: v.optional(v.string()),
    documentType: v.optional(v.string()),
    rawText: v.optional(v.string()),
    placeholders: v.optional(v.array(v.string())),
    fields: v.optional(v.array(v.object({ id: v.optional(v.string()), label: v.optional(v.string()), type: v.optional(v.string()) }))),
    preferAi: v.optional(v.boolean()),
  },
  handler: async (_ctx, args) => {
    const input: ClassifierInput = {
      template_title: args.templateTitle,
      name: args.name,
      title: args.title,
      description: args.description,
      slug: args.slug,
      documentType: args.documentType,
      rawText: args.rawText,
      placeholders: args.placeholders,
      fields: args.fields?.map((f) => ({ id: f.id, label: f.label, type: f.type })),
    };

    const deterministic = classifyAndExtract(input);

    // If caller explicitly wants deterministic, skip gateway.
    if (args.preferAi === false) {
      return { source: "deterministic" as const, result: deterministic, aiError: null };
    }

    if (!process.env.VLY_INTEGRATION_KEY) {
      return { source: "deterministic" as const, result: deterministic, aiError: "VLY_INTEGRATION_KEY not configured — deterministic fallback" };
    }

    try {
      const res = await vly.ai.completion({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: buildAiSystemPrompt() },
          { role: "user", content: buildAiUserPrompt(input) },
        ],
        maxTokens: 900,
        temperature: 0.15,
      });

      if (!res.success || !res.data) {
        return { source: "deterministic" as const, result: deterministic, aiError: res.error ?? "AI gateway returned no data" };
      }

      // vly wraps OpenAI shape: choices[0].message.content
      const d = res.data as unknown as Record<string, unknown>;
      const choices = d.choices as Array<{ message?: { content?: string } }> | undefined;
      const raw = (choices?.[0]?.message?.content as string | undefined) ?? (d.output as string | undefined) ?? JSON.stringify(res.data);

      const parsed = coerceAndValidateAiJson(String(raw));
      if (!parsed) {
        return { source: "deterministic" as const, result: deterministic, aiError: "AI returned invalid JSON — fallback applied" };
      }

      return { source: "ai" as const, result: parsed, aiError: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { source: "deterministic" as const, result: deterministic, aiError: msg.slice(0, 240) };
    }
  },
});
