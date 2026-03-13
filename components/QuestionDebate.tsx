import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, Loader2, X, Volume2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { debateQuestion, playTextToSpeech } from '../services/geminiService';

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
}

interface QuestionDebateProps {
  questionText: string;
  options: string[];
  correctAnswerIndex: number;
  userAnswerIndex: number | undefined;
  solution: string;
}

const QuestionDebate: React.FC<QuestionDebateProps> = ({
  questionText,
  options,
  correctAnswerIndex,
  userAnswerIndex,
  solution
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: input.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const responseText = await debateQuestion(
        questionText,
        options,
        correctAnswerIndex,
        userAnswerIndex,
        solution,
        userMsg.text,
        messages.map(m => ({ role: m.role, text: m.text }))
      );

      const modelMsg: Message = { id: (Date.now() + 1).toString(), role: 'model', text: responseText };
      setMessages(prev => [...prev, modelMsg]);
    } catch (error) {
      console.error("Debate error:", error);
      const errorMsg: Message = { id: (Date.now() + 1).toString(), role: 'model', text: "Sorry, I couldn't process your request. Please try again." };
      setMessages(prev => [...prev, errorMsg]);
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
      setTimeout(() => setPlayingMsgId(null), 2000); 
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="mt-4 flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors text-sm font-medium border border-indigo-200 dark:border-indigo-800"
      >
        <MessageSquare className="w-4 h-4" />
        Debate / Challenge
      </button>
    );
  }

  return (
    <div className="mt-4 border border-indigo-200 dark:border-indigo-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
      <div className="bg-indigo-50 dark:bg-indigo-900/30 px-4 py-3 border-b border-indigo-100 dark:border-indigo-800 flex justify-between items-center">
        <h4 className="font-semibold text-indigo-900 dark:text-indigo-300 flex items-center gap-2 text-sm">
          <MessageSquare className="w-4 h-4" />
          Debate & Discussion
        </h4>
        <button 
          onClick={() => setIsOpen(false)}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      
      <div className="p-4 h-64 overflow-y-auto bg-slate-50 dark:bg-slate-950/50 flex flex-col gap-4">
        {messages.length === 0 ? (
          <div className="text-center text-slate-500 dark:text-slate-400 text-sm my-auto">
            <p>Have a doubt? Ask why your answer was wrong or challenge the explanation.</p>
            <p className="mt-1 text-xs opacity-70">Example: "Why is option B wrong?"</p>
          </div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm relative group ${
                msg.role === 'user' 
                  ? 'bg-indigo-600 text-white rounded-tr-sm' 
                  : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-tl-sm shadow-sm'
              }`}>
                {msg.role === 'user' ? (
                  msg.text
                ) : (
                  <>
                    <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-slate-900 prose-pre:text-slate-50">
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    </div>
                    {!isLoading && msg.text && (
                      <button
                        onClick={() => handlePlayTTS(msg.id, msg.text)}
                        disabled={playingMsgId === msg.id}
                        className="absolute -right-10 top-0 p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                        title="Read aloud"
                      >
                        {playingMsgId === msg.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Volume2 className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400" />
              <span className="text-sm text-slate-500 dark:text-slate-400">Analyzing...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask your doubt..."
            className="flex-1 bg-slate-100 dark:bg-slate-800 border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-0 rounded-lg px-4 py-2 text-sm text-slate-900 dark:text-slate-100 transition-all"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="p-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-lg transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuestionDebate;
