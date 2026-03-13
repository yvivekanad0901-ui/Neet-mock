import React, { useState, useRef } from 'react';
import { Upload, Sparkles, X, Loader2, Camera, Volume2 } from 'lucide-react';
import { analyzeDoubtImage, playTextToSpeech } from '../services/geminiService';

export const DoubtSolver: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");
  const [playingTTS, setPlayingTTS] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        // Remove data URL prefix for API
        const base64Data = base64String.split(',')[1]; 
        setImage(base64Data);
        setResult(""); // Clear previous result
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyze = async () => {
    if (!image) return;
    setLoading(true);
    setResult("");
    const analysis = await analyzeDoubtImage(image, "कृपया इस प्रश्न या चित्र का विस्तार से हिंदी में विश्लेषण करें। (Please analyze in detail in Hindi)");
    setResult(analysis);
    setLoading(false);
  };

  const handleClose = () => {
    setIsOpen(false);
    setImage(null);
    setResult("");
    setPlayingTTS(false);
  };

  const handlePlayTTS = async () => {
    if (!result || playingTTS) return;
    setPlayingTTS(true);
    try {
      await playTextToSpeech(result);
    } catch (error) {
      console.error("Failed to play TTS:", error);
    } finally {
      setTimeout(() => setPlayingTTS(false), 2000);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-4 rounded-full shadow-xl hover:shadow-2xl hover:scale-105 transition-all z-40 flex items-center gap-2 font-medium"
      >
        <Camera className="w-6 h-6" />
        <span className="hidden md:inline">Ask AI Doubt</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            AI Doubt Solver (Hindi)
          </h2>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-white dark:bg-slate-900">
          {!image ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-12 text-center hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
            >
              <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-600 dark:text-slate-300 font-medium">फ़ोटो अपलोड करें (Click to Upload Photo)</p>
              <p className="text-sm text-slate-400 mt-2">प्रश्न या डायग्राम की फोटो लें</p>
              <input 
                ref={fileInputRef}
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={handleFileChange}
              />
            </div>
          ) : (
            <div className="space-y-4">
               <div className="relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 max-h-60 flex justify-center">
                  <img src={`data:image/jpeg;base64,${image}`} alt="Preview" className="object-contain max-h-full" />
                  <button 
                    onClick={() => setImage(null)}
                    className="absolute top-2 right-2 bg-white/80 dark:bg-black/50 p-1 rounded-full text-slate-700 dark:text-white hover:bg-white dark:hover:bg-black/80"
                  >
                    <X className="w-4 h-4" />
                  </button>
               </div>

               {!result && !loading && (
                 <button 
                    onClick={handleAnalyze}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                 >
                   <Sparkles className="w-5 h-5" />
                   Analyze Now (विश्लेषण करें)
                 </button>
               )}
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-8 text-slate-500 dark:text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-purple-600 mb-3" />
              <p>Gemini is thinking... (AI सोच रहा है...)</p>
            </div>
          )}

          {result && (
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-6 border border-purple-100 dark:border-purple-800 relative group">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold text-purple-900 dark:text-purple-300">AI का उत्तर:</h3>
                <button
                  onClick={handlePlayTTS}
                  disabled={playingTTS}
                  className="p-2 text-purple-500 hover:text-purple-700 dark:hover:text-purple-400 transition-colors disabled:opacity-50"
                  title="Read aloud"
                >
                  {playingTTS ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Volume2 className="w-5 h-5" />
                  )}
                </button>
              </div>
              <div className="prose prose-sm prose-purple dark:prose-invert text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                {result}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};