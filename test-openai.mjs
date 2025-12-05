import { createRequire } from 'module';
import OpenAI from "openai";

const require = createRequire(import.meta.url);
require('./backend/node_modules/dotenv').config({ path: './backend/.env' });

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function main() {
  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "Say 'usage-test'." }],
  });

  console.log("message:", res.choices[0].message);
  console.log("usage:", res.usage);
}

main().catch(console.error);
