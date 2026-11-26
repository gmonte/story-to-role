import {
  env as transformersEnv,
  pipeline,
  type FeatureExtractionPipeline,
} from "@huggingface/transformers";

import { embeddingModel } from "./embedding-model";

/**
 * Vectors for retrieval (ADR 0004): a local multilingual model, so no AI
 * vendor receives career text for them and an English opening still finds
 * Portuguese evidence. Runs inside Trigger.dev tasks only.
 */

/** e5 models embed searches and searched texts with different prefixes. */
export type EmbeddingKind = "query" | "passage";

export type Embedder = {
  embed(texts: string[], kind: EmbeddingKind): Promise<number[][]>;
};

/**
 * The machine of every task that embeds: the model's runtime alone fills
 * most of the default machine's 0.5 GB, which a run then exceeds and dies.
 */
export const embeddingMachine = "small-2x";

// Texts embedded per model call: a batch's memory grows with its size
// times the longest text, so one opening's thirty terms at once ran out.
const batchSize = 8;

let extractor: Promise<FeatureExtractionPipeline> | undefined;

function getExtractor() {
  // Models are cached on disk after the first download.
  transformersEnv.allowLocalModels = false;
  extractor ??= pipeline("feature-extraction", embeddingModel, {
    dtype: "q8",
  });
  return extractor;
}

export const localEmbedder: Embedder = {
  async embed(texts, kind) {
    if (texts.length === 0) return [];
    const model = await getExtractor();
    const vectors: number[][] = [];
    for (let start = 0; start < texts.length; start += batchSize) {
      const output = await model(
        texts.slice(start, start + batchSize).map((text) => `${kind}: ${text}`),
        { pooling: "mean", normalize: true }
      );
      vectors.push(...(output.tolist() as number[][]));
      output.dispose();
    }
    return vectors;
  },
};
