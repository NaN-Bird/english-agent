import React, { useState, useRef, useEffect } from "react";
import "./Chat.css";

const API_URL = "/api/chat";
const SAVE_URL = "/api/save-message";
const HISTORY_URL = "/api/history";
const TRACK_URL = "/api/track";
const PROGRESS_URL = "/api/progress";

function getUserId() {
    let id = localStorage.getItem("userId");
    if (!id) {
        id = "user_" + Math.random().toString(36).slice(2, 10);
        localStorage.setItem("userId", id);
    }
    return id;
}

function countWords(text) {
    return text.trim().split(/\s+/).filter(Boolean).length;
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
    const [progress, setProgress] = useState(null);
    const [showContacts, setShowContacts] = useState(false);

    const messagesEndRef = useRef(null);
    const recognitionRef = useRef(null);
    const userIdRef = useRef(getUserId());

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

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

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
                }
            } catch (err) {
                console.warn("Історія не завантажена:", err.message);
            } finally {
                setHistoryLoaded(true);
            }
        };
        loadHistory();
        loadProgress();
    }, []);

    const loadProgress = async () => {
        try {
            const res = await fetch(`${PROGRESS_URL}/${userIdRef.current}`);
            if (!res.ok) return;
            const data = await res.json();
            setProgress(data);
        } catch (err) {
            console.warn("Прогрес не завантажено:", err.message);
        }
    };

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

    const trackEvent = async (type, topicValue, wordCount = 0) => {
        try {
            await fetch(TRACK_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: userIdRef.current,
                    type,
                    topic: topicValue,
                    wordCount,
                }),
            });
        } catch (err) {
            console.warn("Не вдалось записати подію:", err.message);
        }
    };

    const sendMessage = async (text) => {
        if (!text.trim() || loadingRef.current) return;

        const userMessage = { role: "user", content: text };
        setMessages((prev) => [...prev, userMessage]);
        setInput("");
        setLoading(true);

        saveMessage("user", text, topicRef.current);
        trackEvent("message_sent", topicRef.current, countWords(text));

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

            saveMessage("assistant", data.reply, topicRef.current);
            speak(data.reply);

            loadProgress();
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

    const clearHistory = async () => {
        if (!window.confirm("Видалити всю історію чату?")) return;
        try {
            const newId = "user_" + Math.random().toString(36).slice(2, 10);
            localStorage.setItem("userId", newId);
            userIdRef.current = newId;
            setMessages([]);
            setProgress(null);
        } catch (err) {
            console.error("Помилка очищення:", err);
        }
    };

    const stopAll = () => {
        window.speechSynthesis.cancel();
        if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch (e) {}
        }
        setIsListening(false);
        setConversationMode(false);
        conversationModeRef.current = false;
    };

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

            {progress && (
                <div className="progress-bar">
                    <div className="progress-item">
                        <span className="progress-value">{progress.streak}</span>
                        <span className="progress-label">Streak</span>
                    </div>
                    <div className="progress-item">
                        <span className="progress-value">{progress.totalMessages}</span>
                        <span className="progress-label">Повідомлень</span>
                    </div>
                    <div className="progress-item">
                        <span className="progress-value">{progress.totalWords}</span>
                        <span className="progress-label">Слів</span>
                    </div>
                    <div className="progress-item">
                        <span className="progress-value">{progress.favoriteTopic}</span>
                        <span className="progress-label">Тема</span>
                    </div>
                </div>
            )}

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

            <footer className="app-footer">
                <span>by </span>
                <button
                    className="author-link"
                    onClick={() => setShowContacts(true)}
                >
                    NaN_Bird
                </button>
            </footer>

            {showContacts && (
                <div className="modal-overlay" onClick={() => setShowContacts(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <h3>Зв'язатися з автором</h3>
                        <a
                            href="https://t.me/NaN_Bird"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="contact-link"
                        >
                            Telegram
                        </a>
                        <a
                            href="https://github.com/NaN-Bird"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="contact-link"
                        >
                            GitHub
                        </a>
                        <a
                            href="https://wa.me/NaN_Bird"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="contact-link"
                        >
                            WhatsApp
                        </a>
                        <button
                            className="modal-close"
                            onClick={() => setShowContacts(false)}
                        >
                            Закрити
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}