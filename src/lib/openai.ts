import { createOpenAI } from "@ai-sdk/openai";

export const customOpenai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.BASE_URL,
});
