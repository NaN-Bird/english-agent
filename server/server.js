import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(express.json());

// ===== CORS =====
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:3000")
    .split(",")
    .map((s) => s.trim());

console.log("🔓 ALLOWED_ORIGINS:", ALLOWED_ORIGINS);

app.use(
    cors({
        origin: (origin, cb) => {
            console.log("🌐 CORS origin:", JSON.stringify(origin));
            if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
            console.error("❌ CORS blocked for origin:", JSON.stringify(origin));
            cb(new Error("Not allowed by CORS"));
        },
        credentials: true,
    })
);

console.log("🚀 Сервер запущено!");

// ===== GROQ (OpenAI-сумісний) =====
if (!process.env.GROQ_API_KEY) {
    console.error("❌ Немає GROQ_API_KEY у .env — сервер не зможе звертатися до AI");
}

const openai = new OpenAI({
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: process.env.GROQ_API_KEY || "missing",
});

// ===== AI CHAT =====
app.post("/api/chat", async (req, res) => {
    const { message, history = [], topic = "general" } = req.body;

    if (!message) {
        return res.status(400).json({ error: "Повідомлення обов'язкове" });
    }

    const systemPrompt = `You are an English teacher for Ukrainian students.
Topic: ${topic}.

IMPORTANT: The student may write in Ukrainian or English.
You MUST ALWAYS answer in ENGLISH ONLY.

Rules:
1. ALWAYS answer in English
2. If the student writes in Ukrainian, answer in English anyway
3. Correct mistakes gently
4. Explain difficult words (you can add Ukrainian translation in parentheses)
5. Ask questions to continue conversation
6. Be friendly and encouraging

CRITICAL FORMATTING RULES — FOLLOW STRICTLY:
1. NEVER use emojis (no 😊, ❌, ✅, 🤔, 💪, or any others)
2. NEVER use markdown asterisks (** or *)
3. NEVER use special unicode symbols (❌, ✅, ✓, ✗, →, etc.)
4. When correcting mistakes, use plain text:
   WRONG: how do you do
   CORRECT: How do you do?
5. Write clean, natural English sentences only.
   Your entire response will be read aloud by text-to-speech,
   so it must sound natural when spoken.
6. Do not use bullet lists with symbols — use plain numbered lists
   or short paragraphs instead.`;

    const messages = [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: message },
    ];

    try {
        const completion = await openai.chat.completions.create({
            model: "openai/gpt-oss-120b",
            messages,
            temperature: 0.7,
        });

        const reply =
            completion.choices?.[0]?.message?.content ||
            "Sorry, I didn't understand.";

        res.json({ reply, topic });
    } catch (err) {
        console.error("❌ Помилка:", err?.response?.data || err.message || err);
        res.status(500).json({ error: "Помилка сервера" });
    }
});

// ===== ЗАПУСК =====
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});