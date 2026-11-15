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
    const output = await model(
      texts.map((text) => `${kind}: ${text}`),
      { pooling: "mean", normalize: true }
    );
    return output.tolist() as number[][];
  },
};
