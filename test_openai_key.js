import OpenAI from "openai";
import 'dotenv/config';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function testKey() {
  try {
    const response = await client.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{role: "user", content: "Testa om OpenAI API-key fungerar"}]
    });
    console.log("✅ Key fungerar! Här är svaret:");
    console.log(response.choices[0].message.content);
  } catch (err) {
    console.error("❌ Key fungerar inte eller är fel:", err.message);
  }
}

testKey();