import React, { useState, useRef, useEffect } from "react";
import "./Chat.css";

const API_URL = "/api/chat";   // ✅ працює і локально (з proxy), і на VPS

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

    // Автоскрол до низу
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // ===== ВІДПРАВКА =====
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!input.trim() || loading) return;

        const userMessage = { role: "user", content: input };
        setMessages((prev) => [...prev, userMessage]);
        setInput("");
        setLoading(true);

        try {
            const response = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: input,
                    history: messages,
                    topic: topic
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

    // ===== ЗУПИНИТИ ВСЕ =====
    const stopAll = () => {
        // Зупинити озвучку
        window.speechSynthesis.cancel();

        // Зупинити розпізнавання
        if (recognitionRef.current) {
            try {
                recognitionRef.current.stop();
            } catch (e) {
                console.log("Recognition already stopped");
            }
        }

        setIsListening(false);
        setConversationMode(false);
        console.log("⏹️ Все зупинено");
    };

    // ===== РОЗПІЗНАВАННЯ ГОЛОСУ =====
    const startListening = () => {
        const SpeechRecognition =
            window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            alert("❌ Ваш браузер не підтримує голосовий ввід");
            return;
        }

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

            // Автоматично відправити (якщо режим бесіди)
            if (conversationMode) {
                setTimeout(() => {
                    const form = document.querySelector(".chat-form");
                    if (form) {
                        form.requestSubmit();
                    }
                }, 500);
            }
        };

        recognition.onerror = (event) => {
            console.error("Помилка:", event.error);
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
        if (!autoSpeak) return;

        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "en-US";
        utterance.rate = 0.9;
        utterance.pitch = 1;

        // Після озвучки — знову слухати (тільки в режимі бесіди)
        utterance.onend = () => {
            if (conversationMode) {
                setTimeout(() => {
                    startListening();
                }, 500);
            }
        };

        window.speechSynthesis.speak(utterance);
    };

    return (
        <div className="chat-container">
            <h1>🇬🇧 English Practice</h1>

            {/* Вибір теми */}
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

            {/* Перемикач озвучки */}
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

            {/* Режим бесіди */}
            <div className="conversation-toggle">
                <label>
                    <input
                        type="checkbox"
                        checked={conversationMode}
                        onChange={(e) => {
                            setConversationMode(e.target.checked);
                            if (e.target.checked) {
                                setTimeout(() => startListening(), 300);
                            } else {
                                stopAll();
                            }
                        }}
                    />
                    🗣️ Режим бесіди (hands-free)
                </label>

                {conversationMode && (
                    <button
                        className="stop-btn"
                        onClick={stopAll}
                        title="Зупинити"
                    >
                        ⏹️ Стоп
                    </button>
                )}
            </div>

            {/* Чат */}
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

            {/* Форма */}
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