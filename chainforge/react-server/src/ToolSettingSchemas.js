/**
 * A place to put all tools supported by ChainForge and their 
 * settings as react-jsonschema-form JSON schemas.
 * The schemas describe the structure of HTML settings forms for that specific model. 
 * 
 * By convention, the key used for a 'property' should be the exact same 
 * parameter name in the back-end for that API call (e.g., 'top_k' for OpenAI chat completions)
 * All properties that refer to temperature must use the key 'temperature'.
 * 
 * Descriptions of OpenAI model parameters copied from OpenAI's official chat completions documentation: https://platform.openai.com/docs/models/model-endpoint-compatibility
 */
export let AvailableTools = [
  "Text generation",
  "Text translation",
  "Text-to-image",
  "Image-to-text",
  "Image-to-image",
];

export let ToolType2Models = {
  "Text generation": [
    { model: "gpt2"},
    // { name: "GPT3.5", emoji: "🤖", model: "gpt-3.5-turbo", base_model: "gpt-3.5-turbo", temp: 1.0 },  // The base_model designates what settings form will be used, and must be unique.
    // { name: "GPT4", emoji: "🥵", model: "gpt-4", base_model: "gpt-4", temp: 1.0 },
    { name: "HuggingFace", emoji: "🤗", model: "tiiuae/falcon-7b-instruct", base_model: "hf", temp: 1.0 },
  ],
  "Text translation": [
    {model: "t5-base"},
    {model: "Helsinki-NLP/opus-mt-zh-en"},
    // {model: "facebook/nllb-200-distilled-600M"}
  ],
  "Text-to-image": [
    {model: "stabilityai/stable-diffusion-2"},
    {model: "runwayml/stable-diffusion-v1-5"}
  ], 
  "Image-to-text": [
    {model: "nlpconnect/vit-gpt2-image-captioning"}
  ],
  "Image-to-image": [
    { model: "timbrooks/instruct-pix2pix"}, 
    { model: "lllyasviel/sd-controlnet-depth"},
  ],
}

export let ToolType2IOType = {
  "Text generation": { input_type: "text", output_type: "text"},
  "Text translation": { input_type: "text", output_type: "text"},
  "Text-to-image": { input_type: "text", output_type: "image"},
  "Image-to-text": { input_type: "image", output_type: "text"},
  "Image-to-image": { input_type: "image", output_type: "image"},
}
