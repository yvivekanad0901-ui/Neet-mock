
export type QuizMode = 'full_mock' | 'chapter_wise' | 'topic_wise' | 'custom_mixed';

export type DifficultyMode = 'real_neet' | 'advanced' | 'ncert_revision';

export interface QuizConfig {
  mode: QuizMode;
  difficultyMode: DifficultyMode; 
  subject?: 'Physics' | 'Chemistry' | 'Biology';
  unit?: string;
  chapter?: string;
  topic?: string;
  totalQuestions: number;
  // New: For Custom Mixed Test - Stores selected chapters per subject
  customSyllabus?: Record<string, string[]>;
}

export interface Question {
  id: number;
  subject: 'Physics' | 'Chemistry' | 'Biology';
  text: string;
  options: string[];
  correctAnswer: number; // 0-3
  solution: string; // Explanation
  conceptCategory?: string; // Topic Name
  unitName?: string; 
  chapterName?: string; 
  topic?: string;
  difficultyLevel?: 'Hard' | 'Medium' | 'Tricky' | 'Easy';
  weightage?: 'High' | 'Medium' | 'Low';
}

export interface QuizState {
  config: QuizConfig;
  questions: (Question | null)[];
  userAnswers: Record<number, number>; // questionId -> selectedOptionIndex
  currentQuestionIndex: number;
  status: 'idle' | 'setup' | 'loading' | 'active' | 'finished' | 'analyzing' | 'history' | 'review' | 'error' | 'pyq_trends';
  errorAction?: 'fetch_batch' | 'analyze';
  score: number;
  startTime: number;
}

export interface SubjectStats {
  total: number;
  correct: number;
  incorrect: number;
  unattempted: number;
  score: number;
  accuracy: number;
}

export interface TestResult {
  id: string;
  date: string;
  mode: string;
  totalScore: number;
  maxScore: number;
  subjectWise: {
    Physics: number;
    Chemistry: number;
    Biology: number;
  };
  rankPrediction: string;
  // Enhanced History: Full snapshot
  questions?: (Question | null)[];
  userAnswers?: Record<number, number>;
  config?: QuizConfig;
  detailedAnalysis?: ExamAnalysis; // Optional detailed analysis for history
}

export interface ExamAnalysis {
  // Calculated stats
  totalScore: number;
  maxScore: number;
  overallAccuracy: number;
  subjectWise: {
    Physics: SubjectStats;
    Chemistry: SubjectStats;
    Biology: SubjectStats;
  };

  // AI Insights
  rankPrediction: string;
  conceptualAnalysis: string; // General feedback
  weakTopics: { topic: string; reason: string }[];
  strongTopics: string[];
  subjectFeedback: {
    Physics: string;
    Chemistry: string;
    Biology: string;
  };
  roadmap: string[];
}
