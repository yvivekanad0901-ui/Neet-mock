import React, { useState } from 'react';
import { TrendingUp, ArrowLeft, Loader2, Search, BookOpen, Volume2 } from 'lucide-react';
import Markdown from 'react-markdown';
import { analyzePYQTrends, playTextToSpeech } from '../services/geminiService';
import { NEET_DATA } from '../App';

interface PYQTrendsProps {
  onBack: () => void;
}

export const PYQTrends: React.FC<PYQTrendsProps> = ({ onBack }) => {
  const [subject, setSubject] = useState<string>('Physics');
  const [chapter, setChapter] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>('');
  const [playingTTS, setPlayingTTS] = useState(false);

  const handleAnalyze = async () => {
    setLoading(true);
    setResult('');
    try {
      const analysis = await analyzePYQTrends(subject, chapter || null);
      setResult(analysis);
    } catch (error) {
      setResult("Failed to fetch trends. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handlePlayTTS = async () => {
    if (!result || playingTTS) return;
    setPlayingTTS(true);
    try {
      await playTextToSpeech(result);
    } catch (error) {
      console.error("Failed to play TTS:", error);
    } finally {
      // Simplistic reset, actual audio might still be playing
      setTimeout(() => setPlayingTTS(false), 3000);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 hover:bg-white/20 rounded-full transition-colors">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <TrendingUp className="w-8 h-8" />
            <div>
              <h2 className="text-2xl font-bold">PYQ Trends Analyzer</h2>
              <p className="text-blue-100 text-sm">Analyze Previous Year Question trends for NEET</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 md:p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Subject Selection */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                Select Subject
              </label>
              <select
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  setChapter(''); // Reset chapter when subject changes
                }}
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                {Object.keys(NEET_DATA).map(sub => (
                  <option key={sub} value={sub}>{sub}</option>
                ))}
              </select>
            </div>

            {/* Chapter Selection */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                Select Chapter (Optional)
              </label>
              <select
                value={chapter}
                onChange={(e) => setChapter(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">All Chapters (Overall Subject Trend)</option>
                {NEET_DATA[subject] && Object.entries(NEET_DATA[subject]).map(([unit, chapters]) => (
                  <optgroup key={unit} label={unit}>
                    {chapters.map(ch => (
                      <option key={ch} value={ch}>{ch}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                Analyzing Trends...
              </>
            ) : (
              <>
                <Search className="w-6 h-6" />
                Analyze Trends
              </>
            )}
          </button>

          {/* Result Area */}
          {result && (
            <div className="mt-8 p-6 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
                  <BookOpen className="w-5 h-5 text-blue-500" />
                  <h3 className="font-bold text-lg">Trend Analysis Report</h3>
                </div>
                <button
                  onClick={handlePlayTTS}
                  disabled={playingTTS}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50"
                  title="Read Aloud"
                >
                  <Volume2 className={`w-4 h-4 ${playingTTS ? 'animate-pulse' : ''}`} />
                  {playingTTS ? 'Playing...' : 'Read Aloud'}
                </button>
              </div>
              <div className="prose dark:prose-invert max-w-none prose-headings:text-blue-600 dark:prose-headings:text-blue-400 prose-a:text-blue-500">
                <Markdown>{result}</Markdown>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
