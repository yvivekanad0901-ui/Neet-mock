import React, { useState } from 'react';
import { Question } from '../types';
import { Volume2, Loader2 } from 'lucide-react';
import { playTextToSpeech } from '../services/geminiService';

interface QuizCardProps {
  question: Question;
  selectedOption: number | undefined;
  onSelectOption: (index: number) => void;
  questionNumber: number;
}

export const QuizCard: React.FC<QuizCardProps> = ({
  question,
  selectedOption,
  onSelectOption,
  questionNumber,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);

  const handleSpeak = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    // Construct a readable string for the question and options
    const textToRead = `
      प्रश्न संख्या ${questionNumber}. 
      ${question.text}. 
      विकल्प एक: ${question.options[0]}. 
      विकल्प दो: ${question.options[1]}. 
      विकल्प तीन: ${question.options[2]}. 
      विकल्प चार: ${question.options[3]}.
    `;
    await playTextToSpeech(textToRead);
    setIsPlaying(false);
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg p-6 md:p-8 border border-slate-200 dark:border-slate-700 transition-colors">
      <div className="flex justify-between items-start mb-6">
        <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 uppercase tracking-wide">
          {question.subject}
        </span>
        <button
          onClick={handleSpeak}
          disabled={isPlaying}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-colors ${
            isPlaying 
              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 cursor-wait' 
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
          title="प्रश्न सुनें (Listen)"
        >
          {isPlaying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
          {isPlaying ? 'बोल रहा हूँ...' : 'सुनें'}
        </button>
      </div>

      <h3 className="text-xl font-medium text-slate-800 dark:text-slate-100 mb-6 leading-relaxed">
        <span className="font-bold text-slate-400 mr-2">Q{questionNumber}.</span>
        {question.text}
      </h3>

      <div className="space-y-3">
        {question.options.map((option, idx) => (
          <button
            key={idx}
            onClick={() => onSelectOption(idx)}
            className={`w-full text-left p-4 rounded-lg border-2 transition-all duration-200 flex items-center group ${
              selectedOption === idx
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <div className={`w-6 h-6 rounded-full border-2 mr-4 flex items-center justify-center flex-shrink-0 ${
               selectedOption === idx ? 'border-blue-500' : 'border-slate-300 dark:border-slate-600 group-hover:border-blue-400'
            }`}>
              {selectedOption === idx && <div className="w-3 h-3 rounded-full bg-blue-500" />}
            </div>
            <span className={`text-lg ${selectedOption === idx ? 'text-blue-900 dark:text-blue-300 font-medium' : 'text-slate-700 dark:text-slate-300'}`}>
              {option}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};