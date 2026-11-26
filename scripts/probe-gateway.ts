import { generateText, Output } from "ai";
import { z } from "zod";

async function main() {
  const models = ["anthropic/claude-sonnet-5", "anthropic/claude-haiku-4.5", "openai/gpt-5"];
  for (const m of models) {
    try {
      const { output } = await generateText({
        model: m,
        output: Output.object({ schema: z.object({ ok: z.boolean(), word: z.string() }) }),
        prompt: 'Reply with {"ok":true,"word":"ready"}',
      });
      console.log("OK  ", m, JSON.stringify(output));
      return;
    } catch (e) {
      console.log("FAIL", m, String((e as Error).message).slice(0, 180).replace(/\n/g, " "));
    }
  }
}
main();
export {};
