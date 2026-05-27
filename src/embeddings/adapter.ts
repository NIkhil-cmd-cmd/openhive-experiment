export interface EmbeddingAdapter {
  embed(text: string): Promise<number[]>;
  dims: number;
  modelId: string;
}
