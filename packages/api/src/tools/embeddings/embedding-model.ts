/**
 * The embedding model's identity, kept apart from the model runtime so the
 * schema can use it without loading transformers.js in the web app.
 */
export const embeddingModel = "Xenova/multilingual-e5-small";
export const embeddingDimensions = 384;
