import React, { useState, useRef, useEffect } from "react";
import "./Chat.css";

const API_URL = "/api/chat";

export default function Chat() {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [topic, setTopic] = useState("general");
    const [isListening, setIsListening] = useState(false);
    const [autoSpeak, setAutoSpeak] = useState(true);
    const [conversationMode, setConversationMode] = useState(false);

    const messagesEndRef = useRef(null);
    const recognitionRef = useRef(null);

    // 🔑 Refs для актуальних значень у замиканнях
    const conversationModeRef = useRef(conversationMode);
    const loadingRef = useRef(loading);
    const messagesRef = useRef(messages);
    const topicRef = useRef(topic);
    const autoSpeakRef = useRef(autoSpeak);

    // Синхронізуємо refs зі станом
    useEffect(() => { conversationModeRef.current = conversationMode; }, [conversationMode]);
    useEffect(() => { loadingRef.current = loading; }, [loading]);
    useEffect(() => { messagesRef.current = messages; }, [messages]);
    useEffect(() => { topicRef.current = topic; }, [topic]);
    useEffect(() => { autoSpeakRef.current = autoSpeak; }, [autoSpeak]);

    // Автоскрол
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // ===== ВІДПРАВКА =====
    const sendMessage = async (text) => {
        if (!text.trim() || loadingRef.current) return;

        const userMessage = { role: "user", content: text };
        setMessages((prev) => [...prev, userMessage]);
        setInput("");
        setLoading(true);

        try {
            const response = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: text,
                    history: messagesRef.current,
                    topic: topicRef.current
                })
            });

            const data = await response.json();
            const aiMessage = { role: "assistant", content: data.reply };
            setMessages((prev) => [...prev, aiMessage]);
            speak(data.reply);
        } catch (err) {
            console.error("Помилка:", err);
            setMessages((prev) => [
                ...prev,
                { role: "assistant", content: "❌ Помилка з'єднання" }
            ]);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        sendMessage(input);
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
            alert("❌ Ваш браузер не підтримує голосовий ввід");
            return;
        }

        // Якщо вже слухаємо — не запускаємо знову
        if (isListening) return;

        const recognition = new SpeechRecognition();
        recognition.lang = "en-US";
        recognition.continuous = false;
        recognition.interimResults = false;
        recognitionRef.current = recognition;

        recognition.onstart = () => {
            setIsListening(true);
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            setInput(transcript);
            setIsListening(false);

            console.log("🎤 Розпізнано:", transcript, "| Режим бесіди:", conversationModeRef.current);

            // Автоматично відправити (перевіряємо через ref!)
            if (conversationModeRef.current) {
                setTimeout(() => sendMessage(transcript), 300);
            }
        };

        recognition.onerror = (event) => {
            console.error("Recognition помилка:", event.error);
            setIsListening(false);
        };

        recognition.onend = () => {
            setIsListening(false);
        };

        try {
            recognition.start();
        } catch (e) {
            console.log("Recognition already started");
        }
    };

    // ===== ОЗВУЧКА =====
    const speak = (text) => {
        if (!autoSpeakRef.current) return;
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "en-US";
        utterance.rate = 0.9;
        utterance.pitch = 1;

        utterance.onend = () => {
            console.log("🔊 Озвучка закінчена | Режим бесіди:", conversationModeRef.current);
            // Після озвучки — знову слухати (перевіряємо через ref!)
            if (conversationModeRef.current) {
                setTimeout(() => startListening(), 500);
            }
        };

        window.speechSynthesis.speak(utterance);
    };

    return (
        <div className="chat-container">
            <h1>🇬🇧 English Practice</h1>

            <div className="topic-selector">
                <label>Тема:</label>
                <select value={topic} onChange={(e) => setTopic(e.target.value)}>
                    <option value="general">Загальна</option>
                    <option value="business">Business</option>
                    <option value="travel">Travel</option>
                    <option value="technology">Technology</option>
                    <option value="daily life">Daily Life</option>
                </select>
            </div>

            <div className="speak-toggle">
                <label>
                    <input
                        type="checkbox"
                        checked={autoSpeak}
                        onChange={(e) => setAutoSpeak(e.target.checked)}
                    />
                    🔊 Озвучувати відповіді
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
                    🗣️ Режим бесіди (hands-free)
                </label>

                {conversationMode && (
                    <button className="stop-btn" onClick={stopAll} title="Зупинити">
                        ⏹️ Стоп
                    </button>
                )}
            </div>

            <div className="messages">
                {messages.length === 0 && (
                    <div className="welcome">
                        <p>👋 Hello! Let's practice English!</p>
                        <p>Напиши щось англійською — і я відповім!</p>
                        <p>Або натисни 🎤 і говори.</p>
                    </div>
                )}
                {messages.map((msg, index) => (
                    <div key={index} className={`message ${msg.role}`}>
                        <div className="message-content">{msg.content}</div>
                    </div>
                ))}
                {loading && (
                    <div className="message assistant">
                        <div className="message-content">⏳ Думаю...</div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSubmit} className="chat-form">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={isListening ? "🎤 Слухаю..." : "Write in English..."}
                    disabled={loading || isListening}
                />
                <button
                    type="button"
                    className={`mic-btn ${isListening ? "listening" : ""}`}
                    onClick={startListening}
                    disabled={loading || isListening}
                    title="Говорити"
                >
                    {isListening ? "🔴" : "🎤"}
                </button>
                <button type="submit" disabled={loading || isListening}>
                    📤
                </button>
            </form>
        </div>
    );
}