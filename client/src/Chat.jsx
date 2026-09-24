import React, { useState, useRef, useEffect } from "react";
import "./Chat.css";

const API_URL = "/api/chat";
const SAVE_URL = "/api/save-message";
const HISTORY_URL = "/api/history";

// Простий userId (поки без акаунтів)
function getUserId() {
    let id = localStorage.getItem("userId");
    if (!id) {
        id = "user_" + Math.random().toString(36).slice(2, 10);
        localStorage.setItem("userId", id);
    }
    return id;
}

export default function Chat() {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [topic, setTopic] = useState("general");
    const [isListening, setIsListening] = useState(false);
    const [autoSpeak, setAutoSpeak] = useState(true);
    const [conversationMode, setConversationMode] = useState(false);
    const [historyLoaded, setHistoryLoaded] = useState(false);

    const messagesEndRef = useRef(null);
    const recognitionRef = useRef(null);
    const userIdRef = useRef(getUserId());

    // Refs для актуальних значень у замиканнях
    const conversationModeRef = useRef(conversationMode);
    const loadingRef = useRef(loading);
    const messagesRef = useRef(messages);
    const topicRef = useRef(topic);
    const autoSpeakRef = useRef(autoSpeak);

    useEffect(() => { conversationModeRef.current = conversationMode; }, [conversationMode]);
    useEffect(() => { loadingRef.current = loading; }, [loading]);
    useEffect(() => { messagesRef.current = messages; }, [messages]);
    useEffect(() => { topicRef.current = topic; }, [topic]);
    useEffect(() => { autoSpeakRef.current = autoSpeak; }, [autoSpeak]);

    // Автоскрол
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // ===== ЗАВАНТАЖЕННЯ ІСТОРІЇ ПРИ СТАРТІ =====
    useEffect(() => {
        const loadHistory = async () => {
            try {
                const res = await fetch(`${HISTORY_URL}/${userIdRef.current}`);
                if (!res.ok) throw new Error("Не вдалось завантажити історію");
                const data = await res.json();
                if (data.messages && data.messages.length > 0) {
                    const restored = data.messages.map((m) => ({
                        role: m.role,
                        content: m.content,
                    }));
                    setMessages(restored);
                    console.log("📜 Історія завантажена:", restored.length, "повідомлень");
                }
            } catch (err) {
                console.warn("Історія не завантажена:", err.message);
            } finally {
                setHistoryLoaded(true);
            }
        };
        loadHistory();
    }, []);

    // ===== ЗБЕРЕЖЕННЯ ПОВІДОМЛЕННЯ =====
    const saveMessage = async (role, content, topicValue) => {
        try {
            await fetch(SAVE_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: userIdRef.current,
                    role,
                    content,
                    topic: topicValue,
                }),
            });
        } catch (err) {
            console.warn("Не вдалось зберегти повідомлення:", err.message);
        }
    };

    // ===== ВІДПРАВКА =====
    const sendMessage = async (text) => {
        if (!text.trim() || loadingRef.current) return;

        const userMessage = { role: "user", content: text };
        setMessages((prev) => [...prev, userMessage]);
        setInput("");
        setLoading(true);

        // Зберігаємо повідомлення користувача
        saveMessage("user", text, topicRef.current);

        try {
            const response = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: text,
                    history: messagesRef.current,
                    topic: topicRef.current,
                }),
            });

            const data = await response.json();
            const aiMessage = { role: "assistant", content: data.reply };
            setMessages((prev) => [...prev, aiMessage]);

            // Зберігаємо відповідь AI
            saveMessage("assistant", data.reply, topicRef.current);

            speak(data.reply);
        } catch (err) {
            console.error("Помилка:", err);
            setMessages((prev) => [
                ...prev,
                { role: "assistant", content: "Помилка з'єднання" },
            ]);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        sendMessage(input);
    };

    // ===== ОЧИСТИТИ ІСТОРІЮ =====
    const clearHistory = async () => {
        if (!window.confirm("Видалити всю історію чату?")) return;
        try {
            // Створюємо нового userId → історія "обнуляється"
            const newId = "user_" + Math.random().toString(36).slice(2, 10);
            localStorage.setItem("userId", newId);
            userIdRef.current = newId;
            setMessages([]);
            console.log("🗑️ Історія очищена, новий userId:", newId);
        } catch (err) {
            console.error("Помилка очищення:", err);
        }
    };

    // ===== ЗУПИНИТИ ВСЕ =====
    const stopAll = () => {
        window.speechSynthesis.cancel();
        if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch (e) {}
        }
        setIsListening(false);
        setConversationMode(false);
        conversationModeRef.current = false;
        console.log("⏹️ Все зупинено");
    };

    // ===== РОЗПІЗНАВАННЯ =====
    const startListening = () => {
        const SpeechRecognition =
            window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            alert("Ваш браузер не підтримує голосовий ввід");
            return;
        }

        if (isListening) return;

        const recognition = new SpeechRecognition();
        recognition.lang = "en-US";
        recognition.continuous = false;
        recognition.interimResults = false;
        recognitionRef.current = recognition;

        recognition.onstart = () => setIsListening(true);

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            setInput(transcript);
            setIsListening(false);

            console.log("🎤 Розпізнано:", transcript);

            if (conversationModeRef.current) {
                setTimeout(() => sendMessage(transcript), 300);
            }
        };

        recognition.onerror = (event) => {
            console.error("Recognition помилка:", event.error);
            setIsListening(false);
        };

        recognition.onend = () => setIsListening(false);

        try {
            recognition.start();
        } catch (e) {
            console.log("Recognition already started");
        }
    };

    // ===== ОЗВУЧКА (з очищенням від емодзі) =====
    const speak = (text) => {
        if (!autoSpeakRef.current) return;
        window.speechSynthesis.cancel();

        const cleanText = text
            .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
            .replace(/[\u{2600}-\u{27BF}]/gu, "")
            .replace(/\*\*/g, "")
            .replace(/\*/g, "")
            .replace(/#{1,6}\s/g, "")
            .replace(/`/g, "")
            .replace(/\s+/g, " ")
            .trim();

        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = "en-US";
        utterance.rate = 0.9;
        utterance.pitch = 1;

        utterance.onend = () => {
            if (conversationModeRef.current) {
                setTimeout(() => startListening(), 500);
            }
        };

        window.speechSynthesis.speak(utterance);
    };

    return (
        <div className="chat-container">
            <h1>English Practice</h1>

            <div className="topic-selector">
                <label>Тема:</label>
                <select value={topic} onChange={(e) => setTopic(e.target.value)}>
                    <option value="general">Загальна</option>
                    <option value="business">Business</option>
                    <option value="travel">Travel</option>
                    <option value="technology">Technology</option>
                    <option value="daily life">Daily Life</option>
                </select>
                <button className="clear-btn" onClick={clearHistory} title="Очистити історію">
                    Очистити
                </button>
            </div>

            <div className="speak-toggle">
                <label>
                    <input
                        type="checkbox"
                        checked={autoSpeak}
                        onChange={(e) => setAutoSpeak(e.target.checked)}
                    />
                    Озвучувати відповіді
                </label>
            </div>

            <div className="conversation-toggle">
                <label>
                    <input
                        type="checkbox"
                        checked={conversationMode}
                        onChange={(e) => {
                            const checked = e.target.checked;
                            setConversationMode(checked);
                            conversationModeRef.current = checked;
                            if (checked) {
                                setTimeout(() => startListening(), 300);
                            } else {
                                stopAll();
                            }
                        }}
                    />
                    Режим бесіди (hands-free)
                </label>

                {conversationMode && (
                    <button className="stop-btn" onClick={stopAll} title="Зупинити">
                        Стоп
                    </button>
                )}
            </div>

            <div className="messages">
                {!historyLoaded && (
                    <div className="welcome">
                        <p>Завантаження історії...</p>
                    </div>
                )}
                {historyLoaded && messages.length === 0 && (
                    <div className="welcome">
                        <p>Hello! Let's practice English!</p>
                        <p>Напиши щось англійською — і я відповім!</p>
                        <p>Або натисни «Говорити» і говори.</p>
                    </div>
                )}
                {messages.map((msg, index) => (
                    <div key={index} className={`message ${msg.role}`}>
                        <div className="message-content">{msg.content}</div>
                    </div>
                ))}
                {loading && (
                    <div className="message assistant">
                        <div className="message-content">Думаю...</div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSubmit} className="chat-form">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={isListening ? "Слухаю..." : "Write in English..."}
                    disabled={loading || isListening}
                />
                <button
                    type="button"
                    className={`mic-btn ${isListening ? "listening" : ""}`}
                    onClick={startListening}
                    disabled={loading || isListening}
                    title="Говорити"
                >
                    {isListening ? "Стоп" : "Говорити"}
                </button>
                <button type="submit" disabled={loading || isListening}>
                    Send
                </button>
            </form>
        </div>
    );
}