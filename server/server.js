import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import { MongoClient } from "mongodb";

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

// ===== GROQ =====
if (!process.env.GROQ_API_KEY) {
    console.error("❌ Немає GROQ_API_KEY у .env");
}

const openai = new OpenAI({
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: process.env.GROQ_API_KEY || "missing",
});

// ===== MONGODB =====
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/english-agent";
let messagesCollection;
let eventsCollection;

const mongoClient = new MongoClient(MONGODB_URI);

mongoClient
    .connect()
    .then(() => {
        const db = mongoClient.db("english-agent");
        messagesCollection = db.collection("messages");
        eventsCollection = db.collection("learning_events");
        console.log("✅ MongoDB підключено:", MONGODB_URI);
    })
    .catch((err) => {
        console.error("❌ MongoDB помилка:", err.message);
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

// ===== ЗБЕРЕЖЕННЯ ПОВІДОМЛЕННЯ =====
app.post("/api/save-message", async (req, res) => {
    const { userId, role, content, topic } = req.body;

    if (!userId || !role || !content) {
        return res.status(400).json({ error: "userId, role, content обов'язкові" });
    }

    if (!messagesCollection) {
        return res.status(503).json({ error: "MongoDB не підключено" });
    }

    try {
        await messagesCollection.insertOne({
            userId,
            role,
            content,
            topic: topic || "general",
            createdAt: new Date(),
        });
        res.json({ ok: true });
    } catch (err) {
        console.error("❌ Помилка збереження:", err);
        res.status(500).json({ error: "Помилка сервера" });
    }
});

// ===== ЗАВАНТАЖЕННЯ ІСТОРІЇ =====
app.get("/api/history/:userId", async (req, res) => {
    if (!messagesCollection) {
        return res.status(503).json({ error: "MongoDB не підключено" });
    }

    try {
        const messages = await messagesCollection
            .find({ userId: req.params.userId })
            .sort({ createdAt: 1 })
            .limit(200)
            .toArray();

        res.json({ messages });
    } catch (err) {
        console.error("❌ Помилка завантаження:", err);
        res.status(500).json({ error: "Помилка сервера" });
    }
});

// ===== ЗАПИС ПОДІЇ НАВЧАННЯ =====
app.post("/api/track", async (req, res) => {
    const { userId, type, topic, wordCount } = req.body;

    if (!userId || !type) {
        return res.status(400).json({ error: "userId і type обов'язкові" });
    }

    if (!eventsCollection) {
        return res.status(503).json({ error: "MongoDB не підключено" });
    }

    try {
        await eventsCollection.insertOne({
            userId,
            type,
            topic: topic || "general",
            wordCount: wordCount || 0,
            createdAt: new Date(),
        });
        res.json({ ok: true });
    } catch (err) {
        console.error("❌ Помилка track:", err);
        res.status(500).json({ error: "Помилка сервера" });
    }
});

// ===== СТАТИСТИКА ПРОГРЕСУ =====
app.get("/api/progress/:userId", async (req, res) => {
    if (!eventsCollection) {
        return res.status(503).json({ error: "MongoDB не підключено" });
    }

    try {
        const events = await eventsCollection
            .find({ userId: req.params.userId })
            .sort({ createdAt: -1 })
            .toArray();

        // 1. Повідомлення
        const totalMessages = events.filter((e) => e.type === "message_sent").length;

        // 2. Слова
        const totalWords = events.reduce((sum, e) => sum + (e.wordCount || 0), 0);

        // 3. Улюблена тема
        const topicCounts = {};
        events.forEach((e) => {
            if (e.topic) topicCounts[e.topic] = (topicCounts[e.topic] || 0) + 1;
        });
        const favoriteTopic =
            Object.entries(topicCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
            "general";

        // 4. Streak
        const days = [
            ...new Set(events.map((e) => e.createdAt.toISOString().split("T")[0])),
        ]
            .sort()
            .reverse();

        let streak = 0;
        let expected = new Date().toISOString().split("T")[0];

        for (const day of days) {
            if (day === expected) {
                streak++;
                const d = new Date(expected);
                d.setDate(d.getDate() - 1);
                expected = d.toISOString().split("T")[0];
            } else {
                break;
            }
        }

        res.json({
            streak,
            totalMessages,
            totalWords,
            favoriteTopic,
        });
    } catch (err) {
        console.error("❌ Помилка progress:", err);
        res.status(500).json({ error: "Помилка сервера" });
    }
});

// ===== ЗАПУСК =====
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});