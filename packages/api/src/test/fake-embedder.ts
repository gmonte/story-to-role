import type { Embedder } from "@repo/api/tools/embeddings/embedder";
import { embeddingDimensions } from "@repo/api/tools/embeddings/embedding-model";

/**
 * A deterministic stand-in for the local model: a bag of words hashed into
 * the vector, so texts sharing words are close. No model download in tests.
 */
export const fakeEmbedder: Embedder = {
  async embed(texts) {
    return texts.map((text) => {
      const vector = new Array<number>(embeddingDimensions).fill(0);
      for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
        let hash = 0;
        for (const char of word)
          hash = (hash * 31 + char.charCodeAt(0)) % embeddingDimensions;
        vector[hash] += 1;
      }
      const norm = Math.hypot(...vector) || 1;
      return vector.map((value) => value / norm);
    });
  },
};
