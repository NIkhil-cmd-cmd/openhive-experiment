import OpenAI from 'openai';
import type { EmbeddingAdapter } from './adapter.js';

export class OpenAIEmbedder implements EmbeddingAdapter {
  private client: OpenAI;
  readonly dims = 1536;
  readonly modelId = 'text-embedding-3-small';

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.modelId,
      input: text.slice(0, 8000),
    });
    return response.data[0].embedding;
  }
}
