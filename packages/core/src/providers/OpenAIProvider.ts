/**
 * OpenAI provider (`https://api.openai.com/v1`).
 *
 * Speaks the canonical `chat/completions` wire format. Differences from the
 * shared base: OpenAI only reports token usage on streams when
 * `stream_options.include_usage` is set, which this provider enables.
 */

import type { Logger, ProviderOptions } from "@ultracode/shared";
import { OpenAICompatProvider } from "./openaiCompat.js";

/** Default OpenAI API base URL. */
export const OPENAI_BASE_URL = "https://api.openai.com/v1";

/** LLM provider for the OpenAI platform. */
export class OpenAIProvider extends OpenAICompatProvider {
  public readonly name = "openai";

  constructor(options: ProviderOptions, logger?: Logger) {
    super(options, OPENAI_BASE_URL, logger);
  }

  protected override extraBody(stream: boolean): Record<string, unknown> {
    // Ask OpenAI to emit a final usage chunk on streamed completions.
    return stream ? { stream_options: { include_usage: true } } : {};
  }
}
