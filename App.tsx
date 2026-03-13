
import React, { useState, useEffect, useRef } from 'react';
import { QuizState, Question, ExamAnalysis, TestResult, QuizConfig, QuizMode, DifficultyMode } from './types';
import { generateQuestionBatch, generateExamAnalysis, playTextToSpeech } from './services/geminiService';
import { saveTestResult, getHistorySummaries, getFullTestResult } from './services/storageService';
import { QuizCard } from './components/QuizCard';
import { DoubtSolver } from './components/DoubtSolver';
import { LiveTutor } from './components/LiveTutor';
import { Chatbot } from './components/Chatbot';
import { PYQTrends } from './components/PYQTrends';
import QuestionDebate from './components/QuestionDebate';
import { 
  BrainCircuit, ChevronRight, ChevronLeft, CheckCircle, RotateCcw, Clock, 
  AlertTriangle, FileText, Activity, Grid, X, History as HistoryIcon, 
  ArrowLeft, TrendingUp, Layers, BookOpen, Target, ChevronDown, ChevronUp, 
  CheckSquare, ListChecks, Crosshair, Check, Minus, Search, Eye, Loader2, 
  Sun, Moon, BarChart2, Zap, Beaker, FileDown, WifiOff, RefreshCw, Volume2
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell 
} from 'recharts';

// Global declaration for html2pdf
declare var html2pdf: any;

// --- DATA: Revised Syllabus Structure (Comprehensive NEET 2026 Syllabus) ---
export const NEET_DATA: Record<string, Record<string, string[]>> = {
  Physics: {
    "Class 11": [
      "Units and Measurements",
      "Motion in a Straight Line",
      "Motion in a Plane",
      "Laws of Motion",
      "Work, Energy and Power",
      "System of Particles and Rotational Motion",
      "Gravitation",
      "Mechanical Properties of Solids",
      "Mechanical Properties of Fluids",
      "Thermal Properties of Matter",
      "Thermodynamics",
      "Kinetic Theory",
      "Oscillations",
      "Waves"
    ],
    "Class 12": [
      "Electric Charges and Fields",
      "Electrostatic Potential and Capacitance",
      "Current Electricity",
      "Moving Charges and Magnetism",
      "Magnetism and Matter",
      "Electromagnetic Induction",
      "Alternating Current",
      "Electromagnetic Waves",
      "Ray Optics and Optical Instruments",
      "Wave Optics",
      "Dual Nature of Radiation and Matter",
      "Atoms",
      "Nuclei",
      "Semiconductor Electronics"
    ]
  },
  Chemistry: {
    "Physical Chemistry": [
      "Some Basic Concepts of Chemistry",
      "Structure of Atom",
      "Chemical Bonding and Molecular Structure",
      "Chemical Thermodynamics",
      "Equilibrium",
      "Redox Reactions",
      "Solutions",
      "Electrochemistry",
      "Chemical Kinetics"
    ],
    "Inorganic Chemistry": [
      "Classification of Elements and Periodicity",
      "p-Block Elements",
      "d- and f-Block Elements",
      "Coordination Compounds"
    ],
    "Organic Chemistry": [
      "Organic Chemistry: Basic Principles and Techniques",
      "Hydrocarbons",
      "Haloalkanes and Haloarenes",
      "Alcohols, Phenols and Ethers",
      "Aldehydes, Ketones and Carboxylic Acids",
      "Amines",
      "Biomolecules"
    ]
  },
  Biology: {
    "Diversity & Structural Organisation": [
      "The Living World",
      "Biological Classification",
      "Plant Kingdom",
      "Animal Kingdom",
      "Morphology of Flowering Plants",
      "Anatomy of Flowering Plants",
      "Structural Organisation in Animals"
    ],
    "Cell: Structure and Function": [
      "Cell: The Unit of Life",
      "Biomolecules",
      "Cell Cycle and Cell Division"
    ],
    "Plant Physiology": [
      "Photosynthesis in Higher Plants",
      "Respiration in Plants",
      "Plant Growth and Development"
    ],
    "Human Physiology": [
      "Breathing and Exchange of Gases",
      "Body Fluids and Circulation",
      "Excretory Products and Their Elimination",
      "Locomotion and Movement",
      "Neural Control and Coordination",
      "Chemical Coordination and Integration"
    ],
    "Reproduction": [
      "Sexual Reproduction in Flowering Plants",
      "Human Reproduction",
      "Reproductive Health"
    ],
    "Genetics and Evolution": [
      "Principles of Inheritance and Variation",
      "Molecular Basis of Inheritance",
      "Evolution"
    ],
    "Biology and Human Welfare": [
      "Human Health and Disease",
      "Microbes in Human Welfare"
    ],
    "Biotechnology": [
      "Biotechnology: Principles and Processes",
      "Biotechnology and its Applications"
    ],
    "Ecology": [
      "Organisms and Populations",
      "Ecosystem",
      "Biodiversity and Conservation"
    ]
  }
};

const BATCH_SIZE = 15;

// Helper for safe text replacement
const safeReplace = (text: string | undefined, pattern: string | RegExp, replacement: string) => {
    return (text || "").replace(pattern, replacement);
};

const App: React.FC = () => {
  // Theme State with Persistence
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme) {
        return savedTheme === 'dark';
      }
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // State initialization with config
  const [quizState, setQuizState] = useState<QuizState>({
    config: {
      mode: 'full_mock',
      difficultyMode: 'real_neet',
      totalQuestions: 180
    },
    questions: [],
    userAnswers: {},
    currentQuestionIndex: 0,
    status: 'idle',
    score: 0,
    startTime: Date.now(),
  });
  
  const [timeLeft, setTimeLeft] = useState(0);
  const [analysis, setAnalysis] = useState<ExamAnalysis | null>(null);
  const [showPalette, setShowPalette] = useState(false);
  const [testHistory, setTestHistory] = useState<TestResult[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [playingAnalysisTTS, setPlayingAnalysisTTS] = useState(false);
  
  // Setup Wizard State
  const [setupStep, setSetupStep] = useState<number>(0); 
  const [tempConfig, setTempConfig] = useState<Partial<QuizConfig>>({
      mode: 'full_mock',
      difficultyMode: 'real_neet',
      totalQuestions: 180
  });

  // Custom Test Selection State
  const [customSelection, setCustomSelection] = useState<Record<string, string[]>>({
    Physics: [],
    Chemistry: [],
    Biology: []
  });
  
  const fetchingRef = useRef(false);
  const requestedIndicesRef = useRef<Set<number>>(new Set());

  // Result Screen: Expanded Solutions State
  const [expandedSolutions, setExpandedSolutions] = useState<Set<number>>(new Set());

  // Theme Effect
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  const toggleTheme = () => setDarkMode(!darkMode);

  // Load History Summaries on Mount
  useEffect(() => {
    const loadHistory = async () => {
      const summaries = await getHistorySummaries();
      setTestHistory(summaries);
    };
    loadHistory();
  }, []);

  // Timer Logic
  useEffect(() => {
    let timer: number;
    
    // Check if current question is loaded and rendered
    const currentQuestion = quizState.questions[quizState.currentQuestionIndex];
    const isQuestionLoaded = currentQuestion && currentQuestion.text && currentQuestion.text.trim() !== '';

    // Only run timer if status is strictly 'active' and question is loaded
    if (quizState.status === 'active' && isQuestionLoaded && timeLeft > 0) {
      timer = window.setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            handleSubmitQuiz();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [quizState.status, timeLeft, quizState.currentQuestionIndex, quizState.questions]);

  // Batch Fetching Logic - Dynamic based on Mode
  useEffect(() => {
    if (quizState.status === 'active') {
      const currentIndex = quizState.currentQuestionIndex;
      const total = quizState.config.totalQuestions;

      // Check current
      if (!quizState.questions[currentIndex] && !requestedIndicesRef.current.has(currentIndex)) {
        fetchBatchStartingAt(currentIndex);
      }
      
      // Look ahead
      const lookAheadIndex = currentIndex + BATCH_SIZE;
      if (lookAheadIndex < total && 
          !quizState.questions[lookAheadIndex] && 
          !requestedIndicesRef.current.has(lookAheadIndex)) {
        fetchBatchStartingAt(lookAheadIndex);
      }
    }
  }, [quizState.currentQuestionIndex, quizState.status, quizState.questions]);

  // HARD RESET FUNCTION
  const resetToHome = () => {
    setQuizState(prev => ({ ...prev, status: 'idle' }));
    setSetupStep(0);
    setTempConfig({
      mode: 'full_mock',
      difficultyMode: 'real_neet',
      totalQuestions: 180
    });
    setCustomSelection({ Physics: [], Chemistry: [], Biology: [] });
    setAnalysis(null);
    setExpandedSolutions(new Set());
    requestedIndicesRef.current.clear();
  };

  const retryConnection = () => {
      if (quizState.errorAction === 'analyze') {
          handleSubmitQuiz();
      } else {
          setQuizState(prev => ({ ...prev, status: 'active', errorAction: undefined }));
          // The useEffect will trigger automatically since status becomes active
          // and it detects missing questions at the current index.
      }
  };

  const fetchBatchStartingAt = async (startIndex: number, overrideConfig?: QuizConfig): Promise<boolean> => {
    if (fetchingRef.current) return false;
    
    // Prevent re-fetching same indices
    for (let i = 0; i < BATCH_SIZE; i++) {
        requestedIndicesRef.current.add(startIndex + i);
    }
    
    fetchingRef.current = true;
    
    // STRICT RULE: Use overrideConfig if provided (initial load), otherwise use current state
    const config = overrideConfig || quizState.config;
    
    // Determine Subject strictly
    let subject: 'Physics' | 'Chemistry' | 'Biology' = 'Physics';
    
    if (config.mode === 'full_mock') {
        // 0-44: Physics (45)
        // 45-89: Chemistry (45)
        // 90-179: Biology (90)
        if (startIndex < 45) subject = 'Physics';
        else if (startIndex < 90) subject = 'Chemistry';
        else subject = 'Biology';
    } 
    else if (config.mode === 'custom_mixed' && config.customSyllabus) {
        // Dynamic distribution for custom mixed test
        // 1. Identify valid subjects (those with at least 1 chapter selected)
        const activeSubjects = ['Physics', 'Chemistry', 'Biology'].filter(s => 
            config.customSyllabus![s] && config.customSyllabus![s].length > 0
        );
        
        if (activeSubjects.length > 0) {
            const totalQ = config.totalQuestions;
            const count = activeSubjects.length;
            const sizePerSubject = Math.floor(totalQ / count);
            
            // Calculate which segment the startIndex belongs to
            let found = false;
            let accumulated = 0;
            
            for (let i = 0; i < count; i++) {
                const isLast = i === count - 1;
                const limit = isLast ? totalQ : accumulated + sizePerSubject;
                
                if (startIndex < limit) {
                    subject = activeSubjects[i] as any;
                    found = true;
                    break;
                }
                accumulated += sizePerSubject;
            }
            if (!found) subject = activeSubjects[activeSubjects.length - 1] as any;
        }
    }
    else {
        // STRICT BINDING: Use selected subject. No fallbacks to other subjects.
        if (config.subject) {
            subject = config.subject;
        } else {
            console.error("CRITICAL: Subject missing in non-full-mock mode. Defaulting to Physics to prevent crash.");
            subject = 'Physics';
        }
    }

    try {
        const newQuestions = await generateQuestionBatch(startIndex, BATCH_SIZE, subject, config);
        
        setQuizState(prev => {
            const updatedQuestions = [...prev.questions];
            newQuestions.forEach((q, i) => {
                if (startIndex + i < prev.config.totalQuestions) {
                    updatedQuestions[startIndex + i] = q;
                }
            });
            return { ...prev, questions: updatedQuestions };
        });
        return true;
    } catch (err) {
        console.error("Batch fetch failed", err);
        // SAFETY PROTOCOL: Enter Error State to pause timer and show retry UI
        setQuizState(prev => ({ ...prev, status: 'error', errorAction: 'fetch_batch' }));
        
        // Remove from requested to allow retry later
         for (let i = 0; i < BATCH_SIZE; i++) {
            requestedIndicesRef.current.delete(startIndex + i);
        }
        return false;
    } finally {
        fetchingRef.current = false;
    }
  };

  const startQuiz = async () => {
    // LOCK CONFIG: Capture the exact config from setup, applying defaults
    const finalConfig: QuizConfig = { 
        mode: 'full_mock',
        difficultyMode: 'real_neet',
        totalQuestions: 180,
        ...tempConfig,
        customSyllabus: tempConfig.mode === 'custom_mixed' ? customSelection : undefined
    } as QuizConfig;
    
    // Reset state
    setQuizState({
        config: finalConfig,
        questions: new Array(finalConfig.totalQuestions || 180).fill(null),
        userAnswers: {},
        currentQuestionIndex: 0,
        status: 'loading',
        score: 0,
        startTime: Date.now(),
    });
    requestedIndicesRef.current.clear();
    fetchingRef.current = false;
    setAnalysis(null);
    setExpandedSolutions(new Set());
    
    // Set time (1 min per question approx)
    setTimeLeft((finalConfig.totalQuestions || 180) * 60);

    // Initial fetch using EXPLICIT config to bypass state update race condition
    const success = await fetchBatchStartingAt(0, finalConfig);
    if (success) {
        setQuizState(prev => ({ ...prev, status: 'active' }));
    }
  };

  const handleOptionSelect = (optionIndex: number) => {
    setQuizState(prev => ({
      ...prev,
      userAnswers: {
        ...prev.userAnswers,
        [prev.currentQuestionIndex]: optionIndex
      }
    }));
  };

  const handleSubmitQuiz = async () => {
    setQuizState(prev => ({ ...prev, status: 'analyzing' }));
    
    try {
        const analysisData = await generateExamAnalysis(quizState.questions, quizState.userAnswers);
        setAnalysis(analysisData);
        setQuizState(prev => ({ ...prev, status: 'finished', score: analysisData.totalScore }));
        
        // Save to History
        const result: TestResult = {
            id: Date.now().toString(),
            date: new Date().toISOString(),
            mode: quizState.config.mode,
            totalScore: analysisData.totalScore,
            maxScore: analysisData.maxScore,
            subjectWise: {
                Physics: analysisData.subjectWise.Physics.score,
                Chemistry: analysisData.subjectWise.Chemistry.score,
                Biology: analysisData.subjectWise.Biology.score
            },
            rankPrediction: analysisData.rankPrediction,
            questions: quizState.questions,
            userAnswers: quizState.userAnswers,
            config: quizState.config,
            detailedAnalysis: analysisData
        };
        await saveTestResult(result);
        
        // Refresh history list
        const summaries = await getHistorySummaries();
        setTestHistory(summaries);

    } catch (e) {
        console.error("Analysis failed", e);
        setQuizState(prev => ({ ...prev, status: 'error', errorAction: 'analyze' }));
    }
  };

  const toggleSolution = (id: number) => {
    const newSet = new Set(expandedSolutions);
    if (newSet.has(id)) {
        newSet.delete(id);
    } else {
        newSet.add(id);
    }
    setExpandedSolutions(newSet);
  };

  const handleHistoryClick = async (id: string) => {
      setIsLoadingHistory(true);
      const result = await getFullTestResult(id);
      setIsLoadingHistory(false);
      
      if (result && result.questions) {
          // Rehydrate state to review mode
          setQuizState({
              config: result.config || { 
                  mode: result.mode as QuizMode, 
                  difficultyMode: 'real_neet',
                  totalQuestions: result.questions.length 
              },
              questions: result.questions,
              userAnswers: result.userAnswers || {},
              currentQuestionIndex: 0,
              status: 'review',
              score: result.totalScore,
              startTime: 0
          });
          
          if (result.detailedAnalysis) {
              setAnalysis(result.detailedAnalysis);
          } else {
             // Basic reconstruction if detailed analysis is missing (legacy records)
             const mockAnalysis: ExamAnalysis = {
                 totalScore: result.totalScore,
                 maxScore: result.maxScore,
                 overallAccuracy: 0,
                 subjectWise: {
                     Physics: { total: 0, correct: 0, incorrect: 0, unattempted: 0, score: result.subjectWise?.Physics || 0, accuracy: 0 },
                     Chemistry: { total: 0, correct: 0, incorrect: 0, unattempted: 0, score: result.subjectWise?.Chemistry || 0, accuracy: 0 },
                     Biology: { total: 0, correct: 0, incorrect: 0, unattempted: 0, score: result.subjectWise?.Biology || 0, accuracy: 0 }
                 },
                 rankPrediction: result.rankPrediction,
                 conceptualAnalysis: "Historical Record - Detailed analysis not available.",
                 weakTopics: [],
                 strongTopics: [],
                 subjectFeedback: { Physics: "-", Chemistry: "-", Biology: "-" },
                 roadmap: []
             };
             setAnalysis(mockAnalysis);
          }
      }
  };

  const handleRetake = async (e: React.MouseEvent, testSummary: TestResult) => {
    e.stopPropagation(); // Prevent review click
    
    let configToUse = testSummary.config;

    // Fallback logic for legacy data
    if (!configToUse) {
        setIsLoadingHistory(true);
        const fullResult = await getFullTestResult(testSummary.id);
        setIsLoadingHistory(false);

        if (fullResult && fullResult.questions && fullResult.questions.length > 0) {
             const firstQ = fullResult.questions[0];
             if (firstQ) {
                 configToUse = {
                     mode: fullResult.mode as QuizMode,
                     difficultyMode: 'real_neet', 
                     totalQuestions: fullResult.questions.length,
                     subject: firstQ.subject,
                     chapter: firstQ.chapterName,
                 };
             }
        }
    }
    
    // Default fallback
    if (!configToUse) {
        configToUse = {
             mode: testSummary.mode as QuizMode,
             difficultyMode: 'real_neet',
             totalQuestions: 180
        };
    }

    setTempConfig(configToUse);
    setQuizState(prev => ({ ...prev, status: 'idle' }));
    
    if (configToUse.mode === 'custom_mixed') {
        // For custom mixed, we try to restore selection if present
        if (configToUse.customSyllabus) {
            setCustomSelection(configToUse.customSyllabus);
        }
        setSetupStep(1.5); // Fixed: Jump to Step 1.5 (Custom Selection) instead of 3
    } else if (configToUse.mode !== 'full_mock' && !configToUse.subject) {
        setSetupStep(1); 
    } else {
        setSetupStep(2); 
    }
  };

  // --- PDF PAGE SAFETY ENGINE (STRICT 4 QUESTIONS/PAGE) ---
  const handleDownloadPDF = async () => {
    if (isGeneratingPDF || !quizState.questions.length) return;
    setIsGeneratingPDF(true);

    try {
        const questions = quizState.questions;
        const userAnswers = quizState.userAnswers;
        const config = quizState.config;
        const totalScore = quizState.score;
        const maxScore = questions.length * 4;
        
        // MANDATORY VALIDATION: Check Question Count
        if (questions.length === 0 || questions.some(q => q === null)) {
             alert("PDF Generation Failed: Question data incomplete. Please wait for full test to load.");
             setIsGeneratingPDF(false);
             return;
        }

        const dateStr = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
        const filename = `NEET_Test_${dateStr}.pdf`;

        // STRICT CHUNKING: Group questions into pages of 4
        const CHUNK_SIZE = 4;
        const questionChunks = [];
        for (let i = 0; i < questions.length; i += CHUNK_SIZE) {
            questionChunks.push(questions.slice(i, i + CHUNK_SIZE));
        }

        const element = document.createElement('div');
        
        // --- THEME & CONSTANTS ---
        const pageBg = "#0F1C2E";
        const textColor = "#E8EEF5";
        const accentColor = "#7FB7FF";
        
        let htmlContent = `
          <div style="
            background-color: ${pageBg}; 
            color: ${textColor}; 
            font-family: 'Noto Sans Devanagari', sans-serif; 
            width: 100%; 
            box-sizing: border-box;
            font-size: 12px;
          ">
        `;

        // LOOP THROUGH CHUNKS (PAGES)
        questionChunks.forEach((chunk, chunkIndex) => {
            // PAGE WRAPPER: Enforce forced break after each chunk
            htmlContent += `
            <div style="
                padding: 20px;
                display: flex;
                flex-direction: column;
                height: 100%;
                page-break-after: always;
            ">
            `;

            // HEADER: Only on First Page
            if (chunkIndex === 0) {
                htmlContent += `
                <div style="
                  text-align: center;
                  border-bottom: 2px solid ${accentColor};
                  margin-bottom: 20px;
                  padding-bottom: 10px;
                ">
                  <h1 style="color: ${accentColor}; margin: 0; font-size: 24px; text-transform: uppercase;">NEET 2026 Mock Test Result</h1>
                  <p style="color: #C9D1DB; margin: 5px 0 10px 0;">Generated by SmartNEET AI</p>
                  <div style="display: flex; justify-content: center; gap: 20px; font-size: 14px;">
                     <span><strong>Mode:</strong> ${safeReplace(config.mode, /_/g, ' ').toUpperCase()}</span>
                     <span><strong>Score:</strong> <span style="color: #4ADE80;">${totalScore}</span> / ${maxScore}</span>
                  </div>
                </div>
                `;
            } else {
                 // Small spacer for subsequent pages
                 htmlContent += `<div style="height: 10px;"></div>`;
            }

            // GRID CONTAINER: 2 Columns for 4 Questions
            htmlContent += `
            <div style="
                display: flex;
                flex-wrap: wrap;
                justify-content: space-between;
                align-content: flex-start;
                gap: 15px;
            ">
            `;

            chunk.forEach((q, localIndex) => {
                if (!q) return;
                const globalIndex = chunkIndex * CHUNK_SIZE + localIndex;
                const userAns = userAnswers[globalIndex];
                const isCorrect = userAns === q.correctAnswer;
                const userAnsLabel = userAns !== undefined ? String.fromCharCode(65 + userAns) : 'Unattempted';
                const correctAnsLabel = String.fromCharCode(65 + q.correctAnswer);
                const statusColor = userAns === undefined ? '#94A3B8' : (isCorrect ? '#4ADE80' : '#F87171');

                htmlContent += `
                    <div style="
                      width: 48%; /* 2 Columns */
                      background-color: #162B44; 
                      border: 1px solid #1E3A5F; 
                      border-radius: 8px; 
                      padding: 12px;
                      page-break-inside: avoid; /* CRITICAL: Atomic Block */
                      break-inside: avoid;
                      box-sizing: border-box;
                      display: flex;
                      flex-direction: column;
                    ">
                      <!-- Q Meta -->
                      <div style="display: flex; justify-content: space-between; margin-bottom: 6px; color: ${accentColor}; font-size: 9px; font-weight: bold; text-transform: uppercase;">
                          <span>Q.${globalIndex + 1} | ${q.subject}</span>
                          <span>${q.difficultyLevel || 'Medium'}</span>
                      </div>
                      
                      <!-- Q Text -->
                      <div style="font-size: 12px; font-weight: bold; margin-bottom: 10px; line-height: 1.4; color: ${textColor};">
                          ${q.text}
                      </div>

                      <!-- Options -->
                      <div style="
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 6px;
                        margin-bottom: 10px;
                      ">
                        ${q.options.map((opt, idx) => `
                          <div style="font-size: 10px; color: #D6DCE5;">
                            <span style="color: #94A3B8; font-weight: bold;">${String.fromCharCode(65 + idx)})</span> ${opt}
                          </div>
                        `).join('')}
                      </div>

                      <!-- Answer & Explanation -->
                      <div style="
                        margin-top: auto;
                        background-color: ${pageBg}; 
                        padding: 8px; 
                        border-radius: 4px; 
                        border-left: 3px solid ${statusColor}; 
                        font-size: 10px;
                      ">
                        <div style="margin-bottom: 4px; border-bottom: 1px solid #1E3A5F; padding-bottom: 4px;">
                          <span style="margin-right: 10px;">Your: <strong style="color: ${statusColor};">${userAnsLabel}</strong></span>
                          <span>Correct: <strong style="color: #4ADE80;">${correctAnsLabel}</strong></span>
                        </div>
                        <div style="color: #C9D1DB; line-height: 1.3;">
                          <strong style="color: ${accentColor};">Exp:</strong> ${q.solution}
                        </div>
                      </div>
                    </div>
                `;
            });

            // End Grid
            htmlContent += `</div>`;
            
            // Footer per page
            htmlContent += `
             <div style="
                margin-top: auto; 
                text-align: center; 
                color: #64748B; 
                font-size: 8px; 
                padding-top: 10px; 
                border-top: 1px solid #1E3A5F;
             ">
                Page ${chunkIndex + 1} • NEET 2026 Mock Test
             </div>
            `;

            // End Page Wrapper
            htmlContent += `</div>`;
        });

        htmlContent += `</div>`;
        element.innerHTML = htmlContent;

        const opt = {
          margin:       0,
          filename:     filename,
          image:        { type: 'jpeg', quality: 0.98 },
          html2canvas:  { scale: 2, useCORS: true, logging: false, backgroundColor: pageBg, scrollY: 0 },
          jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        if (typeof html2pdf !== 'undefined') {
            await html2pdf().set(opt).from(element).save();
        } else {
            alert("PDF Engine loading... Please retry in 5 seconds.");
        }

    } catch (err) {
        console.error("PDF Fatal Error", err);
        alert("PDF Generation Failed. Please retry.");
    } finally {
        setIsGeneratingPDF(false);
    }
  };

  // --- CUSTOM SELECTION HANDLERS ---
  const toggleCustomChapter = (subject: string, chapter: string) => {
    setCustomSelection(prev => {
        const currentList = prev[subject] || [];
        if (currentList.includes(chapter)) {
            return { ...prev, [subject]: currentList.filter(c => c !== chapter) };
        } else {
            return { ...prev, [subject]: [...currentList, chapter] };
        }
    });
  };

  const toggleAllChaptersInSubject = (subject: string, allChapters: string[]) => {
      setCustomSelection(prev => {
          const currentList = prev[subject] || [];
          if (currentList.length === allChapters.length) {
              // Deselect all
              return { ...prev, [subject]: [] };
          } else {
              // Select all
              return { ...prev, [subject]: [...allChapters] };
          }
      });
  };

  // --- RENDERERS ---

  const renderSetup = () => {
    const stepOne = (
        <div className="space-y-6 animate-fade-in">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Select Mode (मोड चुनें)</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                    { id: 'full_mock', label: 'Full Syllabus Mock', icon: Layers, desc: 'Complete 180 Questions (Phy + Chem + Bio)' },
                    { id: 'chapter_wise', label: 'Chapter Wise', icon: BookOpen, desc: 'Focus on specific chapter' },
                    { id: 'topic_wise', label: 'Topic Wise', icon: Target, desc: 'Deep dive into specific topic' },
                    { id: 'custom_mixed', label: 'Custom Mixed Test', icon: Beaker, desc: 'Select multiple chapters across subjects' },
                    { id: 'history_view', label: 'Test History', icon: HistoryIcon, desc: 'Review Past Attempts & Analysis' },
                    { id: 'pyq_trends', label: 'PYQ Trends', icon: TrendingUp, desc: 'Analyze Previous Year Question Trends' }
                ].map((item) => (
                    <button
                        key={item.id}
                        onClick={() => {
                            if (item.id === 'history_view') {
                                setQuizState(p => ({...p, status: 'history'}));
                                return;
                            }
                            if (item.id === 'pyq_trends') {
                                setQuizState(p => ({...p, status: 'pyq_trends'}));
                                return;
                            }
                            setTempConfig({ ...tempConfig, mode: item.id as QuizMode });
                            if (item.id === 'full_mock') {
                                setTempConfig(prev => ({ ...prev, mode: 'full_mock', totalQuestions: 180 }));
                                setSetupStep(2); // Skip custom setup
                            } else if (item.id === 'custom_mixed') {
                                setSetupStep(1.5); // Go to custom selection
                            } else {
                                setSetupStep(1); // Standard selection
                            }
                        }}
                        className={`p-6 rounded-xl border-2 text-left transition-all hover:scale-105 ${
                            tempConfig.mode === item.id 
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-200 dark:ring-blue-800' 
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-300 dark:hover:border-blue-500'
                        }`}
                    >
                        <div className={`p-3 rounded-full w-fit mb-3 ${tempConfig.mode === item.id ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                            <item.icon className="w-6 h-6" />
                        </div>
                        <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100">{item.label}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{item.desc}</p>
                    </button>
                ))}
            </div>
        </div>
    );

    const stepOnePointFive = ( // Custom Mixed Selection
        <div className="space-y-6 animate-fade-in h-full flex flex-col">
            <div className="flex items-center justify-between mb-2">
                <button onClick={() => setSetupStep(0)} className="flex items-center text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
                    <ArrowLeft className="w-4 h-4 mr-1" /> Back
                </button>
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Create Custom Syllabus</h2>
            </div>
            
            <p className="text-sm text-slate-500 dark:text-slate-400">Select subjects and chapters you want to practice. Questions will be distributed evenly among selected subjects.</p>

            <div className="flex-1 overflow-y-auto custom-scrollbar border rounded-xl border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-4 space-y-6">
                {Object.keys(NEET_DATA).map((subject) => {
                    const allSubjectChapters: string[] = [];
                    Object.values(NEET_DATA[subject]).forEach(unitChapters => allSubjectChapters.push(...unitChapters));
                    
                    const selectedCount = customSelection[subject]?.length || 0;
                    const isAllSelected = selectedCount === allSubjectChapters.length;
                    
                    return (
                        <div key={subject} className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                            <div className="p-4 bg-slate-100 dark:bg-slate-800 flex justify-between items-center">
                                <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">{subject}</h3>
                                <button 
                                    onClick={() => toggleAllChaptersInSubject(subject, allSubjectChapters)}
                                    className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors ${
                                        isAllSelected 
                                        ? 'bg-blue-600 text-white border-blue-600' 
                                        : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600'
                                    }`}
                                >
                                    {isAllSelected ? 'Deselect All' : 'Select All'}
                                </button>
                            </div>
                            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                                {Object.entries(NEET_DATA[subject]).map(([unit, chapters]) => (
                                    <div key={unit} className="space-y-2">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{unit}</h4>
                                        {chapters.map(ch => {
                                            const isSelected = customSelection[subject]?.includes(ch);
                                            return (
                                                <button
                                                    key={ch}
                                                    onClick={() => toggleCustomChapter(subject, ch)}
                                                    className={`w-full text-left flex items-center p-2 rounded-md text-sm transition-all ${
                                                        isSelected 
                                                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium' 
                                                        : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                                                    }`}
                                                >
                                                    <div className={`w-4 h-4 rounded border mr-3 flex items-center justify-center ${
                                                        isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300 dark:border-slate-600'
                                                    }`}>
                                                        {isSelected && <Check className="w-3 h-3 text-white" />}
                                                    </div>
                                                    {ch}
                                                </button>
                                            )
                                        })}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                 <button 
                    disabled={(Object.values(customSelection) as string[][]).every(list => list.length === 0)}
                    onClick={() => setSetupStep(2)}
                    className="w-full bg-blue-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white py-3 rounded-xl font-semibold shadow-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                    Next: Difficulty
                    <span className="text-sm font-normal opacity-80">
                        ({(Object.values(customSelection) as string[][]).reduce((acc, list) => acc + list.length, 0)} Chapters Selected)
                    </span>
                </button>
            </div>
        </div>
    );

    const stepTwo = (
        <div className="space-y-6 animate-fade-in">
            <button onClick={() => setSetupStep(0)} className="flex items-center text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 mb-4">
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </button>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Select Subject & Chapter</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Subject</label>
                    <div className="flex flex-wrap gap-2">
                        {['Physics', 'Chemistry', 'Biology'].map(sub => (
                            <button
                                key={sub}
                                onClick={() => setTempConfig({ ...tempConfig, subject: sub as any, unit: undefined, chapter: undefined })}
                                className={`px-4 py-2 rounded-lg border transition-colors ${
                                    tempConfig.subject === sub
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-blue-400'
                                }`}
                            >
                                {sub}
                            </button>
                        ))}
                    </div>
                </div>

                {tempConfig.subject && (
                    <div>
                         <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Chapter / Unit</label>
                         <select
                            className="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                            value={tempConfig.chapter || ""}
                            onChange={(e) => setTempConfig({ ...tempConfig, chapter: e.target.value })}
                         >
                            <option value="">Select Chapter</option>
                            {/* Guard against undefined access */}
                            {NEET_DATA[tempConfig.subject] && Object.entries(NEET_DATA[tempConfig.subject]).map(([unit, chapters]) => (
                                <optgroup key={unit} label={unit}>
                                    {chapters.map(ch => (
                                        <option key={ch} value={ch}>{ch}</option>
                                    ))}
                                </optgroup>
                            ))}
                         </select>
                    </div>
                )}
            </div>

            {tempConfig.mode === 'topic_wise' && (
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Specific Topic (Optional)</label>
                    <input 
                        type="text"
                        placeholder="e.g. Electric Dipole"
                        className="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                        onChange={(e) => setTempConfig({...tempConfig, topic: e.target.value})}
                    />
                </div>
            )}
            
            <div className="pt-4">
                 <button 
                    disabled={!tempConfig.subject}
                    onClick={() => setSetupStep(2)}
                    className="w-full bg-blue-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white py-3 rounded-xl font-semibold shadow-lg hover:bg-blue-700 transition-colors"
                >
                    Next: Difficulty
                </button>
            </div>
        </div>
    );

    const stepThree = (
        <div className="space-y-6 animate-fade-in">
             <button onClick={() => setSetupStep(tempConfig.mode === 'full_mock' ? 0 : (tempConfig.mode === 'custom_mixed' ? 1.5 : 1))} className="flex items-center text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 mb-4">
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </button>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Set Difficulty & Length</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                    { id: 'real_neet', label: 'Real NEET (Mode A)', color: 'blue', desc: 'NTA Level Pattern (Mix of Medium/Hard)' },
                    { id: 'advanced', label: 'Advanced', color: 'purple', desc: 'Rank Decider (High Difficulty)' },
                    { id: 'ncert_revision', label: 'NCERT Revision', color: 'green', desc: 'Line-by-Line NCERT Check' }
                ].map((d) => (
                    <button
                        key={d.id}
                        onClick={() => setTempConfig({ ...tempConfig, difficultyMode: d.id as DifficultyMode })}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                            tempConfig.difficultyMode === d.id 
                            ? `border-${d.color}-500 bg-${d.color}-50 dark:bg-${d.color}-900/20` 
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                        }`}
                    >
                        <h4 className={`font-bold text-${d.color}-700 dark:text-${d.color}-400`}>{d.label}</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{d.desc}</p>
                    </button>
                ))}
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Number of Questions</label>
                <div className="flex gap-4">
                    {[10, 30, 45, 90, 180].map(num => (
                        <button
                            key={num}
                            onClick={() => setTempConfig({ ...tempConfig, totalQuestions: num })}
                            className={`px-4 py-2 rounded-lg font-medium border transition-colors ${
                                tempConfig.totalQuestions === num
                                ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900'
                                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600'
                            }`}
                        >
                            {num}
                        </button>
                    ))}
                </div>
            </div>

            <button 
                onClick={startQuiz}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 rounded-xl font-bold text-lg shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
            >
                <BrainCircuit className="w-6 h-6" />
                START MOCK TEST
            </button>
        </div>
    );

    return (
        <div className="max-w-4xl mx-auto px-4 py-8">
            <div className={`bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-8 border border-slate-100 dark:border-slate-800 ${setupStep === 1.5 ? 'h-[80vh] flex flex-col' : ''}`}>
                {setupStep === 0 && stepOne}
                {setupStep === 1 && stepTwo}
                {setupStep === 1.5 && stepOnePointFive}
                {setupStep === 2 && stepThree}
            </div>
        </div>
    );
  };

  const renderQuiz = () => {
    // ERROR STATE UI
    if (quizState.status === 'error') {
        return (
            <div className="h-[calc(100vh-80px)] flex flex-col items-center justify-center text-center p-6 animate-fade-in">
                <div className="bg-red-50 dark:bg-red-900/20 p-8 rounded-2xl max-w-md w-full border border-red-200 dark:border-red-800 shadow-xl">
                    <WifiOff className="w-16 h-16 text-red-500 mx-auto mb-6" />
                    <h2 className="text-2xl font-bold text-red-700 dark:text-red-400 mb-2">Connection Interrupted</h2>
                    <p className="text-slate-600 dark:text-slate-300 mb-6">
                        AI Service is temporarily unavailable or quota exceeded. Your progress is safe and paused.
                    </p>
                    <button 
                        onClick={retryConnection}
                        className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors"
                    >
                        <RefreshCw className="w-5 h-5" />
                        Retry Connection
                    </button>
                </div>
            </div>
        );
    }

    const question = quizState.questions[quizState.currentQuestionIndex];
    
    // Timer Progress Logic
    const totalTime = quizState.config.totalQuestions * 60;
    const percentage = Math.max(0, Math.min(100, (timeLeft / totalTime) * 100));
    const radius = 24;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;
    
    // Dynamic Colors based on time remaining
    let colorClass = "text-blue-600 dark:text-blue-400";
    let strokeClass = "stroke-blue-600 dark:stroke-blue-400";
    
    if (percentage <= 20) {
        colorClass = "text-red-600 dark:text-red-400";
        strokeClass = "stroke-red-600 dark:stroke-red-400";
    } else if (percentage <= 50) {
        colorClass = "text-amber-500 dark:text-amber-400";
        strokeClass = "stroke-amber-500 dark:stroke-amber-400";
    }

    return (
      <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col md:flex-row gap-6 h-[calc(100vh-80px)]">
        {/* Main Quiz Area */}
        <div className="flex-1 flex flex-col min-h-0">
            {/* Progress Header */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex justify-between items-center mb-4">
                <div className="flex items-center gap-6">
                    {/* Circular Timer */}
                    <div className="relative flex items-center justify-center w-16 h-16">
                        <svg className="w-full h-full transform -rotate-90">
                            {/* Track */}
                            <circle
                                cx="32"
                                cy="32"
                                r={radius}
                                stroke="currentColor"
                                strokeWidth="4"
                                fill="transparent"
                                className="text-slate-100 dark:text-slate-800"
                            />
                            {/* Indicator */}
                            <circle
                                cx="32"
                                cy="32"
                                r={radius}
                                stroke="currentColor"
                                strokeWidth="4"
                                fill="transparent"
                                strokeDasharray={circumference}
                                strokeDashoffset={strokeDashoffset}
                                strokeLinecap="round"
                                className={`${strokeClass} transition-all duration-1000 ease-linear`}
                            />
                        </svg>
                        <div className="absolute flex flex-col items-center justify-center inset-0">
                            <span className={`text-sm font-bold ${colorClass} tabular-nums`}>
                                {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                            </span>
                        </div>
                    </div>

                    <div className="h-10 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block"></div>

                    <div className="flex flex-col">
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">Question</span>
                         <span className="text-xl font-bold text-slate-800 dark:text-slate-100">
                             {quizState.currentQuestionIndex + 1} <span className="text-sm text-slate-400 font-normal">/ {quizState.config.totalQuestions}</span>
                        </span>
                    </div>
                </div>
                
                <button 
                    onClick={() => setShowPalette(!showPalette)}
                    className="md:hidden p-2 text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                    <Grid className="w-5 h-5" />
                </button>
            </div>

            {/* Question Card Area */}
            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {question ? (
                    <QuizCard 
                        question={question}
                        questionNumber={quizState.currentQuestionIndex + 1}
                        selectedOption={quizState.userAnswers[quizState.currentQuestionIndex]}
                        onSelectOption={handleOptionSelect}
                    />
                ) : (
                    <div className="h-64 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 animate-pulse">
                        <Loader2 className="w-8 h-8 animate-spin mb-2" />
                        <p>Generating Question...</p>
                    </div>
                )}
            </div>

            {/* Navigation Footer */}
            <div className="mt-4 flex justify-between gap-4">
                <button 
                    onClick={() => setQuizState(p => ({...p, currentQuestionIndex: Math.max(0, p.currentQuestionIndex - 1)}))}
                    disabled={quizState.currentQuestionIndex === 0}
                    className="px-6 py-3 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                    <ChevronLeft className="w-5 h-5 inline mr-1" /> Prev
                </button>
                
                <div className="flex gap-4">
                    <button 
                        onClick={handleSubmitQuiz}
                        className="px-6 py-3 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 shadow-md"
                    >
                        Submit Test
                    </button>
                </div>

                <button 
                    onClick={() => setQuizState(p => ({...p, currentQuestionIndex: Math.min(p.config.totalQuestions - 1, p.currentQuestionIndex + 1)}))}
                    disabled={quizState.currentQuestionIndex === quizState.config.totalQuestions - 1}
                    className="px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 shadow-lg disabled:opacity-50"
                >
                    Next <ChevronRight className="w-5 h-5 inline ml-1" />
                </button>
            </div>
        </div>

        {/* Question Palette */}
        <div className={`
            fixed inset-y-0 right-0 w-80 bg-white dark:bg-slate-900 shadow-2xl transform transition-transform duration-300 z-30
            md:relative md:transform-none md:w-72 md:shadow-none md:bg-transparent md:block
            ${showPalette ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
        `}>
            <div className="h-full flex flex-col bg-white dark:bg-slate-900 md:rounded-xl md:shadow-lg md:border border-slate-200 dark:border-slate-800">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800 dark:text-slate-100">Question Palette</h3>
                    <button onClick={() => setShowPalette(false)} className="md:hidden text-slate-500">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <div className="grid grid-cols-5 gap-2">
                        {Array.from({ length: quizState.config.totalQuestions }).map((_, idx) => {
                            const isAnswered = quizState.userAnswers[idx] !== undefined;
                            const isCurrent = quizState.currentQuestionIndex === idx;
                            return (
                                <button
                                    key={idx}
                                    onClick={() => {
                                        setQuizState(p => ({ ...p, currentQuestionIndex: idx }));
                                        setShowPalette(false);
                                    }}
                                    className={`
                                        aspect-square rounded-lg text-sm font-semibold flex items-center justify-center border transition-all
                                        ${isCurrent ? 'ring-2 ring-blue-500 z-10' : ''}
                                        ${isAnswered 
                                            ? 'bg-green-500 text-white border-green-600' 
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'}
                                    `}
                                >
                                    {idx + 1}
                                </button>
                            );
                        })}
                    </div>
                </div>
                
                <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-400">
                        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-green-500 rounded-sm"></div> Answered</div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-slate-200 dark:bg-slate-700 rounded-sm"></div> Not Visited</div>
                    </div>
                </div>
            </div>
        </div>
      </div>
    );
  };

  const handlePlayAnalysisTTS = async () => {
    if (!analysis || playingAnalysisTTS) return;
    setPlayingAnalysisTTS(true);
    try {
      const textToRead = `Your total score is ${analysis.totalScore}. ${analysis.conceptualAnalysis}`;
      await playTextToSpeech(textToRead);
    } catch (error) {
      console.error("Failed to play TTS:", error);
    } finally {
      setTimeout(() => setPlayingAnalysisTTS(false), 2000);
    }
  };

  const renderResult = () => {
    // Chart Data Preparation
    const chartData = analysis ? [
        { name: 'Physics', accuracy: analysis.subjectWise.Physics.accuracy, fill: '#3b82f6' },
        { name: 'Chemistry', accuracy: analysis.subjectWise.Chemistry.accuracy, fill: '#f59e0b' },
        { name: 'Biology', accuracy: analysis.subjectWise.Biology.accuracy, fill: '#10b981' },
    ] : [];

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 animate-fade-in">
            {/* Header Score Card */}
            <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-2xl p-8 text-white shadow-2xl mb-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mr-16 -mt-16"></div>
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
                    <div className="text-center md:text-left">
                        <h2 className="text-3xl font-bold mb-2">NEET Test Analysis</h2>
                        <p className="text-indigo-200 flex items-center gap-2">
                             <Target className="w-4 h-4" /> {analysis?.rankPrediction || "Calculating Rank..."}
                        </p>
                    </div>
                    <div className="flex items-center gap-12">
                        <div className="text-center">
                            <div className="text-5xl font-bold mb-1">{analysis?.totalScore}</div>
                            <div className="text-xs text-indigo-300 uppercase tracking-wide">Total Score</div>
                        </div>
                         <div className="w-px h-16 bg-white/20"></div>
                         <div className="text-center">
                            <div className="text-5xl font-bold mb-1">{analysis?.overallAccuracy}%</div>
                            <div className="text-xs text-indigo-300 uppercase tracking-wide">Accuracy</div>
                        </div>
                    </div>
                </div>
            </div>

            {analysis ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* LEFT COLUMN: VISUALS & METRICS */}
                    <div className="lg:col-span-1 space-y-8">
                        {/* CHART */}
                        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
                            <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2">
                                <Activity className="w-5 h-5 text-blue-500" /> Subject Accuracy
                            </h3>
                            <div className="h-64 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                        <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                        <Tooltip 
                                            contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f8fafc' }}
                                            cursor={{fill: 'transparent'}}
                                        />
                                        <Bar dataKey="accuracy" radius={[4, 4, 0, 0]} barSize={40} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* CONCEPTUAL ANALYSIS */}
                        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 relative group">
                             <div className="flex justify-between items-center mb-4">
                               <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                  <BrainCircuit className="w-5 h-5 text-purple-500" /> Insight
                               </h3>
                               <button
                                 onClick={handlePlayAnalysisTTS}
                                 disabled={playingAnalysisTTS}
                                 className="p-2 text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors disabled:opacity-50"
                                 title="Read aloud"
                               >
                                 {playingAnalysisTTS ? (
                                   <Loader2 className="w-4 h-4 animate-spin" />
                                 ) : (
                                   <Volume2 className="w-4 h-4" />
                                 )}
                               </button>
                             </div>
                            <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
                                {analysis.conceptualAnalysis}
                            </p>
                        </div>
                        
                        <div className="flex gap-4">
                            <button 
                                onClick={handleDownloadPDF}
                                disabled={isGeneratingPDF}
                                className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-semibold transition-colors shadow-lg flex items-center justify-center gap-2"
                            >
                                {isGeneratingPDF ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileDown className="w-5 h-5" />}
                                {isGeneratingPDF ? 'Generating PDF...' : 'Download PDF'}
                            </button>
                            <button 
                                onClick={resetToHome}
                                className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold transition-colors shadow-lg"
                            >
                                New Test
                            </button>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: DETAILED FEEDBACK */}
                    <div className="lg:col-span-2 space-y-8">
                        {/* SUBJECT CARDS */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {[
                                { sub: 'Physics', data: analysis.subjectWise.Physics, feedback: analysis.subjectFeedback.Physics, color: 'blue' },
                                { sub: 'Chemistry', data: analysis.subjectWise.Chemistry, feedback: analysis.subjectFeedback.Chemistry, color: 'amber' },
                                { sub: 'Biology', data: analysis.subjectWise.Biology, feedback: analysis.subjectFeedback.Biology, color: 'green' }
                            ].map((item) => (
                                <div key={item.sub} className={`bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-800 relative overflow-hidden group hover:border-${item.color}-500 transition-colors`}>
                                     <div className={`absolute top-0 left-0 w-1 h-full bg-${item.color}-500`}></div>
                                     <div className="flex justify-between items-start mb-3">
                                         <h4 className={`font-bold text-${item.color}-600 dark:text-${item.color}-400`}>{item.sub}</h4>
                                         <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">{item.data.score}</span>
                                     </div>
                                     <div className="flex gap-2 text-xs text-slate-500 dark:text-slate-400 mb-4">
                                         <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" /> {item.data.correct}</span>
                                         <span className="flex items-center gap-1"><X className="w-3 h-3 text-red-500" /> {item.data.incorrect}</span>
                                     </div>
                                     <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed border-t border-slate-100 dark:border-slate-800 pt-3">
                                         {item.feedback}
                                     </p>
                                </div>
                            ))}
                        </div>

                        {/* WEAK AREAS & ROADMAP */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                             <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
                                <h3 className="font-bold text-red-600 dark:text-red-400 mb-4 flex items-center gap-2">
                                    <TrendingUp className="w-5 h-5" /> Weak Areas
                                </h3>
                                <div className="space-y-3">
                                    {analysis.weakTopics.map((item, i) => (
                                        <div key={i} className="flex flex-col bg-red-50 dark:bg-red-900/10 p-3 rounded-lg border border-red-100 dark:border-red-900/30">
                                            <span className="font-semibold text-red-700 dark:text-red-300 text-sm">{item.topic}</span>
                                            <span className="text-xs text-red-600 dark:text-red-400 mt-1">{item.reason}</span>
                                        </div>
                                    ))}
                                </div>
                             </div>

                             <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
                                <h3 className="font-bold text-blue-600 dark:text-blue-400 mb-4 flex items-center gap-2">
                                    <ListChecks className="w-5 h-5" /> Action Plan
                                </h3>
                                <ul className="space-y-3">
                                    {analysis.roadmap.map((step, i) => (
                                        <li key={i} className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300">
                                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs mt-0.5">{i+1}</span>
                                            {step}
                                        </li>
                                    ))}
                                </ul>
                             </div>
                        </div>

                        {/* DETAILED SOLUTIONS LINK */}
                        <div className="pt-4">
                            <h3 className="font-bold text-xl text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2">
                                <FileText className="w-5 h-5 text-blue-600" />
                                Detailed Solutions
                            </h3>
                            {/* Render Questions List (Copied from previous logic but simplified) */}
                            <div className="space-y-4">
                                {quizState.questions.map((q, idx) => {
                                    if (!q) return null;
                                    const userAns = quizState.userAnswers[idx];
                                    const isCorrect = userAns === q.correctAnswer;
                                    const isSkipped = userAns === undefined;
                                    const isOpen = expandedSolutions.has(idx);

                                    return (
                                        <div key={idx} className={`bg-white dark:bg-slate-900 rounded-xl border transition-all ${
                                            isOpen ? 'shadow-md border-blue-200 dark:border-blue-800' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                                        }`}>
                                            <button 
                                                onClick={() => toggleSolution(idx)}
                                                className="w-full p-4 flex items-start gap-4 text-left"
                                            >
                                                <div className={`
                                                    w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-1
                                                    ${isCorrect ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 
                                                    isSkipped ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' : 
                                                    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}
                                                `}>
                                                    {isCorrect ? <Check className="w-4 h-4" /> : isSkipped ? <Minus className="w-4 h-4" /> : <X className="w-4 h-4" />}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Question {idx + 1}</span>
                                                        {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                                                    </div>
                                                    <p className="text-slate-800 dark:text-slate-200 font-medium text-lg leading-relaxed whitespace-pre-wrap">
                                                        {q.text}
                                                    </p>
                                                </div>
                                            </button>
                                            
                                            {isOpen && (
                                                <div className="px-4 pb-6 pt-0 ml-16 border-t border-slate-100 dark:border-slate-800 mt-2">
                                                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        {q.options.map((opt, optIdx) => (
                                                            <div key={optIdx} className={`p-3 rounded-lg border text-sm flex items-start gap-2 ${
                                                                optIdx === q.correctAnswer ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' :
                                                                optIdx === userAns ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' :
                                                                'bg-slate-50 dark:bg-slate-800 border-transparent'
                                                            }`}>
                                                                <span className="font-semibold flex-shrink-0 mt-0.5">{String.fromCharCode(65+optIdx)}.</span>
                                                                <span className={`leading-relaxed whitespace-pre-wrap ${optIdx === q.correctAnswer ? 'text-green-900 dark:text-green-300' : 'text-slate-600 dark:text-slate-400'}`}>{opt}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    
                                                    <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-100 dark:border-blue-800">
                                                        <h4 className="font-semibold text-blue-900 dark:text-blue-300 text-sm mb-2">Explanation:</h4>
                                                        <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                                                            {q.solution}
                                                        </p>
                                                    </div>
                                                    
                                                    <QuestionDebate 
                                                        questionText={q.text}
                                                        options={q.options}
                                                        correctAnswerIndex={q.correctAnswer}
                                                        userAnswerIndex={userAns}
                                                        solution={q.solution}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="text-center py-20 flex flex-col items-center">
                    <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
                    <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Generating Analysis...</h3>
                    <p className="text-slate-500 dark:text-slate-400">AI is analyzing your attempt patterns.</p>
                </div>
            )}
        </div>
    );
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-400/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3"></div>
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-400/10 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/3"></div>
      </div>

      <nav className="relative z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 py-3 sticky top-0">
         <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-3 cursor-pointer" onClick={resetToHome}>
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-blue-500/20">
                    S
                </div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-700 to-indigo-700 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent hidden sm:block">
                    SmartNEET AI
                </h1>
            </div>
            
            <div className="flex items-center gap-4">
                <button 
                  onClick={toggleTheme} 
                  className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-all active:scale-95"
                  aria-label="Toggle Theme"
                >
                    {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>
                {quizState.status !== 'idle' && (
                    <button 
                        onClick={resetToHome}
                        className="text-sm font-semibold text-slate-500 hover:text-red-500 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/10"
                    >
                        Exit
                    </button>
                )}
            </div>
         </div>
      </nav>

      <main className="relative z-10 container mx-auto pb-20">
            {quizState.status === 'idle' && renderSetup()}
            
            {quizState.status === 'loading' && (
                <div className="h-[70vh] flex flex-col items-center justify-center animate-fade-in">
                    <div className="relative">
                        <div className="w-16 h-16 rounded-full border-4 border-slate-200 dark:border-slate-800"></div>
                        <div className="absolute top-0 left-0 w-16 h-16 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"></div>
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mt-6">Preparing Your Test...</h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-2 text-center max-w-md">
                        AI is curating high-yield {quizState.config.mode === 'custom_mixed' ? 'Mixed' : (quizState.config.subject || 'NEET')} questions based on {safeReplace(quizState.config.difficultyMode || 'real_neet', '_', ' ')} difficulty.
                    </p>
                </div>
            )}
            
            {quizState.status === 'active' && renderQuiz()}
            {quizState.status === 'error' && renderQuiz()}
            
            {(quizState.status === 'finished' || quizState.status === 'analyzing' || quizState.status === 'review') && renderResult()}
            
            {quizState.status === 'pyq_trends' && (
                <PYQTrends onBack={() => setQuizState(p => ({...p, status: 'idle'}))} />
            )}

            {quizState.status === 'history' && (
                <div className="max-w-4xl mx-auto px-4 py-8 animate-fade-in">
                    <div className="flex items-center mb-8">
                        <button 
                          onClick={() => setQuizState(p => ({...p, status: 'idle'}))} 
                          className="mr-4 p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors"
                        >
                            <ArrowLeft className="w-6 h-6 text-slate-600 dark:text-slate-300" />
                        </button>
                        <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Test History</h2>
                    </div>
                    
                    <div className="space-y-4">
                        {testHistory.length === 0 ? (
                            <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
                                <HistoryIcon className="w-16 h-16 mx-auto mb-4 text-slate-300 dark:text-slate-600" />
                                <p className="text-lg text-slate-500 font-medium">No test history found yet.</p>
                                <p className="text-slate-400 text-sm mt-1">Take your first mock test to see analytics here.</p>
                            </div>
                        ) : (
                            testHistory.map((test) => (
                                <button 
                                    key={test.id}
                                    onClick={() => handleHistoryClick(test.id)}
                                    className="w-full bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all text-left flex justify-between items-center group"
                                >
                                    <div>
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className="font-bold text-lg text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                                {safeReplace(test.mode || 'Unknown', /_/g, ' ').toUpperCase()}
                                            </span>
                                            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-medium border border-slate-200 dark:border-slate-700">
                                                {new Date(test.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
                                            <div className="flex items-center gap-1">
                                                <Target className="w-4 h-4" />
                                                <span>Score: <span className="font-semibold text-slate-900 dark:text-white">{test.totalScore}</span> / {test.maxScore}</span>
                                            </div>
                                            {test.rankPrediction && (
                                                <div className="flex items-center gap-1 text-purple-600 dark:text-purple-400">
                                                    <TrendingUp className="w-4 h-4" />
                                                    <span className="font-medium">{test.rankPrediction}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div 
                                            role="button"
                                            onClick={(e) => handleRetake(e, test)}
                                            className="p-2.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-all"
                                            title="Retake Test"
                                        >
                                            <RotateCcw className="w-5 h-5" />
                                        </div>
                                        <div className="w-10 h-10 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all">
                                            <ChevronRight className="w-5 h-5" />
                                        </div>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
      </main>
      
      {isLoadingHistory && (
          <div className="fixed inset-0 bg-white/60 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-2xl flex items-center gap-4 border border-slate-200 dark:border-slate-800">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                <span className="font-semibold text-slate-800 dark:text-slate-200">Loading result...</span>
              </div>
          </div>
      )}

      <DoubtSolver />
      <LiveTutor />
      <Chatbot />
    </div>
  );
};

export default App;
