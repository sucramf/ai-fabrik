import fetch from 'node-fetch';
import OpenAI from "openai";
import 'dotenv/config';

// ----- OpenAI -----
async function testOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return console.log("OpenAI key saknas");
  const client = new OpenAI({ apiKey: key });
  try {
    await client.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: "Test" }]
    });
    console.log("✅ OpenAI key fungerar");
  } catch (err) {
    console.log("❌ OpenAI key fungerar inte:", err.message);
  }
}

// ----- Generic API test -----
async function testGenericAPI(name, url, keyHeader, key) {
  if (!key) return console.log(`${name} key saknas`);
  try {
    const res = await fetch(url, { headers: { [keyHeader]: key } });
    if (res.ok) console.log(`✅ ${name} key fungerar`);
    else console.log(`❌ ${name} key svarade med status ${res.status}`);
  } catch (err) {
    console.log(`❌ ${name} key fungerade inte:`, err.message);
  }
}

// ----- Test alla keys -----
async function runTests() {
  await testOpenAI();

  // YouTube API
  await testGenericAPI(
    "YouTube",
    "https://www.googleapis.com/youtube/v3/videos?part=id&id=dQw4w9WgXcQ",
    "X-Goog-Api-Key",
    process.env.YOUTUBE_API_KEY
  );

  // Google API
  await testGenericAPI(
    "Google",
    "https://www.googleapis.com/customsearch/v1?q=test&cx=0000000000000000000",
    "key",
    process.env.GOOGLE_API_KEY
  );

  // LinkedIn
  await testGenericAPI(
    "LinkedIn",
    "https://api.linkedin.com/v2/me",
    "Authorization",
    process.env.LINKEDIN_CLIENT_SECRET ? `Bearer ${process.env.LINKEDIN_CLIENT_SECRET}` : null
  );

  // GitHub
  await testGenericAPI(
    "GitHub",
    "https://api.github.com/user",
    "Authorization",
    process.env.GITHUB_API_KEY ? `token ${process.env.GITHUB_API_KEY}` : null
  );

  // Twitter/X (3 keys)
  for (let i = 1; i <= 3; i++) {
    await testGenericAPI(
      `Twitter/X #${i}`,
      "https://api.twitter.com/2/tweets?ids=20",
      "Authorization",
      process.env[`TWITTER_API_KEY_${i}`] ? `Bearer ${process.env[`TWITTER_API_KEY_${i}`]}` : null
    );
  }

  // Product Hunt
  await testGenericAPI(
    "Product Hunt",
    "https://api.producthunt.com/v2/api/graphql",
    "Authorization",
    process.env.PRODUCTHUNT_API_KEY ? `Bearer ${process.env.PRODUCTHUNT_API_KEY}` : null
  );

  // Etsy
  await testGenericAPI(
    "Etsy",
    "https://openapi.etsy.com/v3/application/openapi-ping",
    "x-api-key",
    process.env.ETSY_API_KEY
  );

  // Kickstarter via RapidAPI
  await testGenericAPI(
    "Kickstarter",
    "https://kickstarter-api.example.com/v1/projects/1", // placeholder, ersätt med riktig RapidAPI endpoint
    "X-RapidAPI-Key",
    process.env.KICKSTARTER_API_KEY
  );

  // ----- TikTok Sandbox Keys -----
  await testGenericAPI(
    "TikTok Client Key",
    "https://open.tiktokapis.com/v1/trending/hashtags",
    "X-Tiktok-Client-Key",
    process.env.TIKTOK_CLIENT_KEY
  );

  await testGenericAPI(
    "TikTok Client Secret",
    "https://open.tiktokapis.com/v1/trending/hashtags",
    "X-Tiktok-Client-Secret",
    process.env.TIKTOK_CLIENT_SECRET
  );
}

runTests();