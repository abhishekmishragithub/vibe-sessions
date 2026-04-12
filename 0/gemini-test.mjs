import { GoogleGenerativeAI } from "@google/generative-ai";
import 'dotenv/config';

async function testGemini() {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        console.error("❌ Error: GEMINI_API_KEY is not set in your .env file.");
        process.exit(1);
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = "Say 'Gemini is active and ready!' if you can hear me.";

    console.log("⏳ Sending request to Gemini...");

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        console.log("✅ Success! Gemini says:");
        console.log("------------------------");
        console.log(text);
        console.log("------------------------");
    } catch (error) {
        console.error("❌ API Request Failed:");
        console.error(error.message);
    }
}

testGemini();
