/**
 * Mistral AI provider (`https://api.mistral.ai/v1`).
 *
 * Mistral exposes an OpenAI-compatible `chat/completions` endpoint including
 * tools/tool_calls, so all wire logic lives in {@link OpenAICompatProvider}.
 */

import type { Logger, ProviderOptions } from "ultracode-shared";
import { MISTRAL_BASE_URL } from "./catalog.js";
import { OpenAICompatProvider } from "./openaiCompat.js";

/** Re-exported for backwards compatibility; canonical home is the catalog. */
export { MISTRAL_BASE_URL };

/** LLM provider for the Mistral AI platform. */
export class MistralProvider extends OpenAICompatProvider {
  public readonly name = "mistral";

  constructor(options: ProviderOptions, logger?: Logger) {
    super(options, MISTRAL_BASE_URL, logger);
  }
}
