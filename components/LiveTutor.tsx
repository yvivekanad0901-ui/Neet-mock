import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, X, Loader2, Volume2, Headphones } from 'lucide-react';
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";

export const LiveTutor: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const nextPlayTimeRef = useRef<number>(0);

  const initAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    return audioContextRef.current;
  };

  const decodeAudioData = async (base64Data: string) => {
    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const audioCtx = initAudioContext();
    const dataInt16 = new Int16Array(bytes.buffer);
    const frameCount = dataInt16.length;
    const buffer = audioCtx.createBuffer(1, frameCount, 24000);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i] / 32768.0;
    }
    
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);

    const currentTime = audioCtx.currentTime;
    if (nextPlayTimeRef.current < currentTime) {
      nextPlayTimeRef.current = currentTime;
    }
    
    source.start(nextPlayTimeRef.current);
    nextPlayTimeRef.current += buffer.duration;
    
    activeSourcesRef.current.push(source);
    setIsSpeaking(true);
    
    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
      if (activeSourcesRef.current.length === 0) {
        setIsSpeaking(false);
      }
    };
  };

  const startMicrophone = async (sessionPromise: Promise<any>) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      } });
      mediaStreamRef.current = stream;
      
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          let s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        const bytes = new Uint8Array(pcm16.buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Data = btoa(binary);
        
        sessionPromise.then((session) => {
          if (session) {
            session.sendRealtimeInput({
              media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
            });
          }
        });
      };
      
      source.connect(processor);
      processor.connect(audioCtx.destination);
      processorRef.current = processor;
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setError("Microphone access denied or not available.");
      disconnect();
    }
  };

  const connect = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const sessionPromise = ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            setIsConnecting(false);
            startMicrophone(sessionPromise);
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              decodeAudioData(base64Audio);
            }
            if (message.serverContent?.interrupted) {
              activeSourcesRef.current.forEach(source => {
                try { source.stop(); } catch (e) {}
              });
              activeSourcesRef.current = [];
              nextPlayTimeRef.current = 0;
              setIsSpeaking(false);
            }
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            setError("Connection error occurred.");
            disconnect();
          },
          onclose: () => {
            disconnect();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: { parts: [{ text: "You are a friendly and encouraging NEET exam tutor. You help students understand Physics, Chemistry, and Biology concepts in Hindi and English (Hinglish). Keep your answers concise, clear, and focused on NEET syllabus." }] },
        },
      });
      sessionRef.current = sessionPromise;
    } catch (err: any) {
      console.error("Failed to connect:", err);
      setError(err.message || "Failed to connect to Live Tutor.");
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    if (sessionRef.current) {
      sessionRef.current.then((session: any) => session?.close());
      sessionRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    activeSourcesRef.current = [];
    nextPlayTimeRef.current = 0;
    setIsConnected(false);
    setIsConnecting(false);
    setIsSpeaking(false);
  };

  const handleClose = () => {
    disconnect();
    setIsOpen(false);
  };

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 right-6 bg-gradient-to-r from-blue-600 to-cyan-600 text-white p-4 rounded-full shadow-xl hover:shadow-2xl hover:scale-105 transition-all z-40 flex items-center gap-2 font-medium"
      >
        <Headphones className="w-6 h-6" />
        <span className="hidden md:inline">Live Tutor</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Headphones className="w-5 h-5 text-blue-600" />
            Live AI Tutor
          </h2>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8 flex flex-col items-center justify-center min-h-[300px] bg-white dark:bg-slate-900">
          <div className={`relative w-32 h-32 rounded-full flex items-center justify-center mb-8 transition-all duration-300 ${isConnected ? (isSpeaking ? 'bg-blue-100 dark:bg-blue-900/40 scale-110' : 'bg-green-100 dark:bg-green-900/40') : 'bg-slate-100 dark:bg-slate-800'}`}>
            {isConnected ? (
              isSpeaking ? (
                <Volume2 className="w-12 h-12 text-blue-600 dark:text-blue-400 animate-pulse" />
              ) : (
                <Mic className="w-12 h-12 text-green-600 dark:text-green-400" />
              )
            ) : (
              <MicOff className="w-12 h-12 text-slate-400" />
            )}
            
            {/* Ripple effect when speaking */}
            {isConnected && isSpeaking && (
              <>
                <div className="absolute inset-0 rounded-full border-2 border-blue-400 dark:border-blue-500 animate-ping opacity-75"></div>
                <div className="absolute inset-[-10px] rounded-full border-2 border-blue-300 dark:border-blue-600 animate-ping opacity-50" style={{ animationDelay: '0.2s' }}></div>
              </>
            )}
          </div>

          <div className="text-center space-y-2 mb-8">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              {isConnected ? (isSpeaking ? "Tutor is speaking..." : "Listening...") : "Start a conversation"}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {isConnected 
                ? "Ask any NEET related question in Hindi or English." 
                : "Talk to your AI tutor in real-time."}
            </p>
            {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
          </div>

          <div className="flex gap-4 w-full">
            {!isConnected ? (
              <button 
                onClick={connect}
                disabled={isConnecting}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors"
              >
                {isConnecting ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Connecting...</>
                ) : (
                  <><Mic className="w-5 h-5" /> Connect</>
                )}
              </button>
            ) : (
              <button 
                onClick={disconnect}
                className="flex-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <MicOff className="w-5 h-5" /> Disconnect
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
