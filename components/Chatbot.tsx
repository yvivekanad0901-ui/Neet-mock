import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Loader2, Bot, User, Volume2 } from 'lucide-react';
import { GoogleGenAI, ThinkingLevel, GenerateContentResponse } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import { playTextToSpeech } from '../services/geminiService';

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
}

export const Chatbot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<any>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const initChat = () => {
    if (!chatRef.current) {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      chatRef.current = ai.chats.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: "You are a helpful and intelligent AI assistant for NEET exam preparation. You can answer questions, explain concepts, and provide guidance. Use Hindi and English (Hinglish) as appropriate.\n\nCRITICAL FORMULA RULE: You MUST display all Physics and Chemistry formulas in plain readable text. Do NOT use LaTeX symbols such as $...$, \\frac{}, \\lambda, \\nu, subscripts, or superscripts. Use simple readable forms instead (e.g., E = h × v, E = h × c / lambda, p = h / lambda, m = E / c²).",
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
        },
      });
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { id: Date.now().toString(), role: 'user', text: input.trim() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    initChat();

    try {
      const responseStream = await chatRef.current.sendMessageStream({ message: userMessage.text });
      
      const modelMessageId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, { id: modelMessageId, role: 'model', text: '' }]);

      for await (const chunk of responseStream) {
        const c = chunk as GenerateContentResponse;
        if (c.text) {
          setMessages(prev => prev.map(msg => 
            msg.id === modelMessageId ? { ...msg, text: msg.text + c.text } : msg
          ));
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: "Sorry, I encountered an error. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlayTTS = async (msgId: string, text: string) => {
    if (playingMsgId) return;
    setPlayingMsgId(msgId);
    try {
      await playTextToSpeech(text);
    } catch (error) {
      console.error("Failed to play TTS:", error);
    } finally {
      // Audio playback might still be happening, but we release the lock
      // A better approach would be to wait for the audio to finish, but playTextToSpeech
      // currently resolves immediately after starting playback. We'll just clear the state after a short delay.
      setTimeout(() => setPlayingMsgId(null), 2000); 
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-44 right-6 bg-gradient-to-r from-emerald-500 to-teal-600 text-white p-4 rounded-full shadow-xl hover:shadow-2xl hover:scale-105 transition-all z-40 flex items-center gap-2 font-medium"
      >
        <MessageCircle className="w-6 h-6" />
        <span className="hidden md:inline">AI Chatbot</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl z-50 flex flex-col border border-slate-200 dark:border-slate-800" style={{ height: '600px', maxHeight: '80vh' }}>
      {/* Header */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900 rounded-t-2xl">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Bot className="w-5 h-5 text-emerald-600" />
          AI Assistant
        </h2>
        <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-900/50">
        {messages.length === 0 && (
          <div className="text-center text-slate-500 dark:text-slate-400 mt-10">
            <Bot className="w-12 h-12 mx-auto mb-3 text-emerald-500/50" />
            <p>Hello! I'm your AI assistant.</p>
            <p className="text-sm">Ask me anything about your NEET preparation.</p>
          </div>
        )}
        
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl p-3 ${
              msg.role === 'user' 
                ? 'bg-emerald-600 text-white rounded-tr-sm' 
                : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-tl-sm shadow-sm'
            }`}>
              {msg.role === 'model' ? (
                <div className="relative group">
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                  </div>
                  {!isLoading && msg.text && (
                    <button
                      onClick={() => handlePlayTTS(msg.id, msg.text)}
                      disabled={playingMsgId === msg.id}
                      className="absolute -right-10 top-0 p-2 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                      title="Read aloud"
                    >
                      {playingMsgId === msg.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{msg.text}</p>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-tl-sm p-3 shadow-sm flex items-center gap-2 text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-b-2xl">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question..."
            className="flex-1 max-h-32 min-h-[44px] bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 dark:text-white resize-none"
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white p-3 rounded-xl transition-colors shrink-0"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
