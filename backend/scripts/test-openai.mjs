import dotenv from 'dotenv';
import OpenAI from "openai";

// Load the backend .env (one level up from scripts/)
dotenv.config({ path: '../.env' });

// Initialize OpenAI client
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Test function to verify OpenAI API access and log usage
async function main() {
  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "Say 'usage-test'." }],
  });

  console.log("message:", res.choices[0].message);
  console.log("usage:", res.usage);
}

main().catch(console.error);
