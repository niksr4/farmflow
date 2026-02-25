import "server-only"

import { openai } from "@ai-sdk/openai"
import { groq } from "@ai-sdk/groq"

export const resolveAgentModel = () => {
  if (process.env.OPENAI_API_KEY) {
    const model = process.env.AGENT_OPENAI_MODEL || "gpt-4o-mini"
    return openai(model)
  }
  if (process.env.GROQ_API_KEY) {
    const model = process.env.AGENT_GROQ_MODEL || "llama-3.3-70b-versatile"
    return groq(model)
  }
  return null
}
