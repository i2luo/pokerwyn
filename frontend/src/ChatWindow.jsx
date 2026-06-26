import { useState, useEffect, useRef } from 'react';

export default function ChatWindow({ messages, onSendMessage, currentPlayer }) {
    const [isOpen, setIsOpen] = useState(true);
    const [inputText, setInputText] = useState("");
    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages, isOpen]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!inputText.trim()) return;
        onSendMessage(inputText);
        setInputText("");
    };

    if (!isOpen) {
        return (
            <button 
                onClick={() => setIsOpen(true)}
                className="pointer-events-auto glass-panel px-4 py-2.5 text-sm font-medium text-white/70 hover:text-white transition-colors flex items-center gap-2"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Chat
                {messages.length > 0 && (
                    <span className="bg-accent-gold/20 text-accent-gold text-[10px] font-semibold rounded-full h-5 min-w-5 px-1 flex items-center justify-center">
                        {messages.length > 9 ? '9+' : messages.length}
                    </span>
                )}
            </button>
        );
    }

    return (
        <div className="pointer-events-auto w-72 h-[320px] flex flex-col glass-panel overflow-hidden">
            <div 
                className="px-4 py-3 border-b border-white/[0.06] flex justify-between items-center cursor-pointer hover:bg-white/[0.03] transition-colors"
                onClick={() => setIsOpen(false)}
            >
                <span className="text-xs font-semibold text-white/50 uppercase tracking-widest">Chat</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
                {messages.length === 0 && (
                    <p className="text-white/20 text-xs text-center mt-8">No messages yet</p>
                )}
                {messages.map((msg) => {
                    const isSystem = msg.type === 'system';
                    const isMe = msg.sender === currentPlayer?.name;

                    return (
                        <div key={msg.id} className={`flex flex-col ${isSystem ? 'items-center' : 'items-start'}`}>
                            {!isSystem && (
                                <span className={`text-[10px] font-semibold mb-0.5 ${isMe ? 'text-accent-emerald' : 'text-white/40'}`}>
                                    {msg.sender}
                                </span>
                            )}
                            <div className={`
                                max-w-[90%] text-sm px-3 py-1.5 rounded-xl
                                ${isSystem ? 'text-white/30 text-xs' : 'bg-white/[0.06] text-white/80'}
                            `}>
                                {msg.text}
                            </div>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSubmit} className="p-3 border-t border-white/[0.06]">
                <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Message…"
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-white/20 transition-colors placeholder-white/25"
                />
            </form>
        </div>
    );
}
