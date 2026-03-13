
import { GoogleGenAI, Type, Modality, ThinkingLevel } from "@google/genai";
import { QuizConfig, ExamAnalysis, SubjectStats } from "../types";

// Global set to track used questions and prevent duplicates across the session
const Used_Questions = new Set<string>();

// Audio Context for TTS
let audioContext: AudioContext | null = null;

const getAudioContext = () => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  }
  return audioContext;
};

// Helper to decode base64
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Helper to decode audio data
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// --- RETRY LOGIC FOR RATE LIMITS ---
const MAX_RETRIES = 4;
const INITIAL_BACKOFF_MS = 10000;

async function withRetry<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      return await operation();
    } catch (error: any) {
      if (attempt < MAX_RETRIES - 1) {
        attempt++;
        const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1) + (Math.random() * 1000);
        console.warn(`[${operationName}] Error hit: ${error?.message || 'Unknown error'}. Retrying in ${Math.round(delay)}ms (Attempt ${attempt}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error(`${operationName} failed after max retries`);
}

/**
 * Generates a batch of questions based on specific config.
 */
export const generateQuestionBatch = async (
  startId: number,
  count: number,
  subject: 'Physics' | 'Chemistry' | 'Biology',
  config: QuizConfig
): Promise<any[]> => {
  return withRetry(async () => {
    let validationAttempts = 0;
    const MAX_VALIDATION_ATTEMPTS = 3;

    while (validationAttempts < MAX_VALIDATION_ATTEMPTS) {
      try {
        let difficultyInstruction = "";
      
      if (config.difficultyMode === 'real_neet') {
        difficultyInstruction = `
          **MODE A - REAL NEET EXAM ENGINE ACTIVATED**
          DISTRIBUTION RULES:
          - 50% Medium: Conceptual, 2-3 line statements, Direct + Inference mix.
          - 30% Hard: Multi-concept linkage, Calculation intensive (Phys/Chem).
          - 20% Tricky: NCERT wording traps, Close options.
          MANDATORY FORMAT MIX: Standard MCQ, Assertion-Reason, Statement Based, Match Column.
        `;
      } 
      else if (config.difficultyMode === 'advanced') {
        difficultyInstruction = "DISTRIBUTION: 60% Hard, 40% Tricky. NO direct questions. Focus on rank deciding problems.";
      } 
      else if (config.difficultyMode === 'ncert_revision') {
        difficultyInstruction = "DISTRIBUTION: 100% NCERT Direct lines (Statement based). Focus on memory and clarity.";
      } 
      else {
        difficultyInstruction = "DISTRIBUTION: Balanced NEET Standard.";
      }

      let chapterInstruction = "";
      let topicInstruction = "";
      let userTopicNormalized = "";

      if (config.topic && config.topic.trim() !== "") {
        userTopicNormalized = config.topic.trim().toLowerCase();
      }

      if (config.mode === 'custom_mixed' && config.customSyllabus) {
        const selectedChapters = config.customSyllabus[subject] || [];
        if (selectedChapters.length > 0) {
           chapterInstruction = `
             CRITICAL CUSTOM SYLLABUS RULE:
             You must generate questions ONLY from the following selected chapters of ${subject}:
             ${JSON.stringify(selectedChapters)}
             
             Do NOT include questions from any other chapter.
             Ensure fair distribution among these selected chapters.
           `;
        }
      } else if (config.chapter) {
        chapterInstruction = `CRITICAL CHAPTER RULE: ALL questions must be STRICTLY from the chapter "${config.chapter}". Do NOT include questions from any other chapter. If the user provided a broad unit name, stick to the curriculum of that unit.`;
        
        if (userTopicNormalized) {
          topicInstruction = `
          CRITICAL TOPIC RULE:
          The user has requested questions ONLY from the specific topic: "${config.topic}".
          100% of the questions MUST be strictly from this topic.
          Do NOT include questions from any other subtopics of the chapter.
          `;
        }
      }

      const systemInstruction = `
        You are the NEET SMART QUESTION ENGINE (Hindi Medium).
        
        CRITICAL SUBJECT RULE:
        You MUST generate questions ONLY for the subject: "${subject}". 
        If the subject is Biology, questions can be from Botany or Zoology sections but the "subject" field in JSON must strictly be "Biology".
        
        ${chapterInstruction}
        ${topicInstruction}
        
        MODE: ${config.mode}
        ${difficultyInstruction}

        ==================================================
        PART 1: DUPLICATE QUESTION PREVENTION
        ==================================================
        Ensure no identical or near-identical questions are generated in the same test.
        Avoid exact repetition of concepts.

        ==================================================
        PART 2: MATCH-THE-FOLLOWING FORMAT
        ==================================================
        Match-type questions MUST follow this exact structure:

        Display:
        Column I        Column II
        A. ...          i. ...
        B. ...          ii. ...
        C. ...          iii. ...
        D. ...          iv. ...

        OPTIONS FORMAT (MANDATORY):
        Options must be in NEET style:
        ["A-i, B-ii, C-iii, D-iv", "A-ii, B-i, C-iv, D-iii", "A-iii, B-iv, C-i, D-ii", "A-iv, B-iii, C-ii, D-i"]

        STRICT RULE:
        ❌ Do not merge columns into one line
        ❌ Do not mix A,B,C,D with i,ii,iii randomly
        ❌ Do not display in paragraph form

        ==================================================
        PART 3: DETAILED SOLUTIONS (NCERT FOCUSED)
        ==================================================
        The "solution" field MUST be a highly detailed, step-by-step explanation in Hindi, easy for a NEET aspirant to understand.
        1. Start with the direct reason why the correct option is right.
        2. Provide the relevant NCERT concept, formula, or fact.
        3. Explicitly explain why EACH of the other three incorrect options is wrong.
        4. Keep the language clear, encouraging, and educational.

        ==================================================
        PART 4: TEXT FORMATTING RULES (CRITICAL)
        ==================================================
        All AI outputs MUST use plain readable text only.
        Do NOT use LaTeX math blocks, math delimiters, $...$, \\frac, \\lambda, \\nu, etc.
        
        Examples:
        - Instead of $YY$, write YY
        - Instead of $yy$, write yy
        - Instead of $Ttyy$, write Ttyy
        - Instead of $E = h\\nu$, write E = h × v
        - Instead of \\frac{hc}{\\lambda}, write E = h × c / lambda
        
        Genetics symbols must appear plainly: TT, Tt, tt, YY, Yy, yy, TtYy. No special symbols around them.
        All formulas, genetics symbols, and equations must be plain text. No LaTeX or mathematical markup should appear anywhere.

        OUTPUT FORMAT:
        Return valid JSON array.
        Language: Hindi (Devanagari) for Question and Options. English for Concept Tags.
      `;

      const prompt = `
        Generate exactly ${count + 3} unique questions for NEET ${subject}.
        Start IDs from ${startId}.
        
        Constraints:
        - Subject: ${subject} (MANDATORY: The "subject" field in JSON must be exactly "${subject}")
        - Chapter: ${config.mode === 'custom_mixed' ? "Mixed from selected list" : (config.chapter || "Mix")}
        
        Return JSON schema:
        [{
          "id": number,
          "subject": "${subject}",
          "text": "Question text in Hindi",
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "correctAnswer": number (0-3),
          "solution": "Detailed solution in Hindi explaining the correct answer and why other options are incorrect",
          "conceptCategory": "Topic Name (English)",
          "unitName": "Unit Name",
          "chapterName": "Chapter Name",
          "topic": "Specific Topic Name (English)",
          "difficultyLevel": "Hard" | "Medium" | "Tricky",
          "weightage": "High"
        }]
      `;

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.INTEGER },
                subject: { type: Type.STRING },
                text: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctAnswer: { type: Type.INTEGER },
                solution: { type: Type.STRING },
                conceptCategory: { type: Type.STRING },
                unitName: { type: Type.STRING },
                chapterName: { type: Type.STRING },
                topic: { type: Type.STRING },
                difficultyLevel: { type: Type.STRING, enum: ["Hard", "Medium", "Tricky", "Easy"] },
                weightage: { type: Type.STRING }
              },
              required: ["id", "subject", "text", "options", "correctAnswer", "solution", "conceptCategory", "unitName", "chapterName", "topic", "difficultyLevel"]
            }
          }
        }
      });

      const jsonText = response.text;
      if (!jsonText) throw new Error("No data returned");
      const data = JSON.parse(jsonText);
      
      const validData: any[] = [];
      
      for (const q of (Array.isArray(data) ? data : [])) {
        if (validData.length >= count) break;

        const qText = q.text?.trim() || "";
        
        // Validation 1: Duplicate check
        if (Used_Questions.has(qText)) {
            console.warn("Duplicate question rejected:", qText);
            continue;
        }

        // Validation 2: Match format check
        const isMatchQuestion = qText.toLowerCase().includes('column i') || qText.includes('स्तंभ I') || qText.includes('कॉलम I');
        if (isMatchQuestion) {
            const hasValidOptions = q.options.every((opt: string) => /A-[iv]+/i.test(opt) || /[A-D]-[iv]+/i.test(opt));
            const hasValidColumns = qText.includes('A.') && qText.includes('i.');
            if (!hasValidOptions || !hasValidColumns) {
                console.warn("Invalid match format rejected:", qText);
                continue;
            }
        }

        // Validation 3: Topic check
        if (userTopicNormalized) {
            const qTopic = (q.topic || q.conceptCategory || "").trim().toLowerCase();
            if (!qTopic) {
                console.warn(`Topic mismatch rejected: Expected '${userTopicNormalized}', got empty topic`);
                continue;
            }
            
            const isMatch = qTopic.includes(userTopicNormalized) || 
                           (qTopic.length > 3 && userTopicNormalized.includes(qTopic));
                           
            if (!isMatch) {
                console.warn(`Topic mismatch rejected: Expected '${userTopicNormalized}', got '${qTopic}'`);
                continue;
            }
        }

        // Validation 4: Subject and Chapter check
        const targetSub = subject.toLowerCase();
        const lowerSub = q.subject?.toLowerCase() || "";
        
        // Subject check (allowing Botany/Zoology for Biology)
        let isValidSubject = lowerSub === targetSub;
        if (targetSub === 'biology' && (lowerSub.includes('botany') || lowerSub.includes('zoology'))) {
            isValidSubject = true;
            q.subject = 'Biology'; // Normalize
        } else if (lowerSub !== targetSub) {
            // Strict check says reject if subject doesn't match
            console.warn(`Subject mismatch rejected: Expected '${subject}', got '${q.subject}'`);
            continue;
        }

        // Chapter check (only if chapter is specified and not custom mixed)
        if (config.chapter && config.mode !== 'custom_mixed') {
            const qChapter = (q.chapterName || "").trim().toLowerCase();
            const targetChapter = config.chapter.trim().toLowerCase();
            if (!qChapter.includes(targetChapter) && !targetChapter.includes(qChapter)) {
                console.warn(`Chapter mismatch rejected: Expected '${config.chapter}', got '${q.chapterName}'`);
                continue;
            }
        }

        // Add to valid data and Used_Questions
        Used_Questions.add(qText);
        
        validData.push(q);
      }

      if (validData.length === 0) {
          throw new Error("Validation Failed: Empty question array returned from AI.");
      }
      
      if (validData.length < count) {
          throw new Error(`Validation Failed: Only got ${validData.length}/${count} valid questions. Regenerating...`);
      }

      return validData;
    } catch (error: any) {
      console.error(`Error generating batch for ${subject} (Attempt ${validationAttempts + 1}/${MAX_VALIDATION_ATTEMPTS}):`, error);
      
      // If it's a validation error, we can retry
      if (error.message && error.message.includes("Validation Failed")) {
        validationAttempts++;
        if (validationAttempts >= MAX_VALIDATION_ATTEMPTS) {
          throw new Error(`Failed to generate valid questions after ${MAX_VALIDATION_ATTEMPTS} attempts. Please try a broader topic.`);
        }
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      
      // If it's another error (like rate limit, which is handled by withRetry, or network), throw it
      throw error;
    }
  }
  throw new Error("Unexpected end of retry loop");
  }, 'generateQuestionBatch');
};

export const generateExamAnalysis = async (
  questions: any[],
  userAnswers: Record<number, number>
): Promise<ExamAnalysis> => {
  return withRetry(async () => {
    try {
      // 1. Detailed Client-Side Calculation
      const stats: Record<string, SubjectStats> = {
        Physics: { total: 0, correct: 0, incorrect: 0, unattempted: 0, score: 0, accuracy: 0 },
        Chemistry: { total: 0, correct: 0, incorrect: 0, unattempted: 0, score: 0, accuracy: 0 },
        Biology: { total: 0, correct: 0, incorrect: 0, unattempted: 0, score: 0, accuracy: 0 },
      };

      let totalScore = 0;
      let totalQuestions = 0;
      let totalCorrect = 0;

      questions.forEach((q, idx) => {
        if (!q) return;
        
        const subj = q.subject;
        const correctAns = q.correctAnswer;
        const userAns = userAnswers[idx];
        
        // Initialize if not present (though initialized above)
        if (!stats[subj]) stats[subj] = { total: 0, correct: 0, incorrect: 0, unattempted: 0, score: 0, accuracy: 0 };
        
        stats[subj].total++;
        totalQuestions++;

        if (userAns === undefined) {
          stats[subj].unattempted++;
        } else if (userAns === correctAns) {
          stats[subj].correct++;
          stats[subj].score += 4;
          totalCorrect++;
        } else {
          stats[subj].incorrect++;
          stats[subj].score -= 1;
        }
      });

      // Calculate aggregates
      Object.keys(stats).forEach(subj => {
        totalScore += stats[subj].score;
        if (stats[subj].total > 0) {
          stats[subj].accuracy = Math.round((stats[subj].correct / stats[subj].total) * 100);
        }
      });

      const overallAccuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
      const maxScore = totalQuestions * 4;

      // 2. AI Analysis Generation
      const prompt = `
        Act as a strict NEET Exam Coach. Analyze this student's Mock Test Performance.
        
        PERFORMANCE DATA:
        Total Score: ${totalScore} / ${maxScore}
        Overall Accuracy: ${overallAccuracy}%
        
        Subject Breakdown:
        Physics: ${JSON.stringify(stats.Physics)}
        Chemistry: ${JSON.stringify(stats.Chemistry)}
        Biology: ${JSON.stringify(stats.Biology)}
        
        REQUIREMENTS (Output in Hindi/Hinglish):
        1. Rank Prediction: Provide a realistic All India Rank (AIR) range based on the score (assume standard paper difficulty).
        2. Conceptual Analysis: Analyze the score patterns. Example: "High negative marking in Physics suggests conceptual gaps, while Biology accuracy is good."
        3. Weak Topics: Identify 3-5 weak areas. Return as objects with "topic" and "reason".
        4. Subject Feedback: Give specific advice for Physics, Chemistry, and Biology separately.
        5. Roadmap: Provide 5 actionable steps for the next 7 days.

        TEXT FORMATTING RULES (CRITICAL):
        All AI outputs MUST use plain readable text only.
        Do NOT use LaTeX math blocks, math delimiters, $...$, \\frac, \\lambda, \\nu, etc.
        Examples:
        - Instead of $YY$, write YY
        - Instead of $yy$, write yy
        - Instead of $Ttyy$, write Ttyy
        - Instead of $E = h\\nu$, write E = h × v
        - Instead of \\frac{hc}{\\lambda}, write E = h × c / lambda
        Genetics symbols must appear plainly: TT, Tt, tt, YY, Yy, yy, TtYy. No special symbols around them.
        All formulas, genetics symbols, and equations must be plain text. No LaTeX or mathematical markup should appear anywhere.
      `;

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              rankPrediction: { type: Type.STRING },
              conceptualAnalysis: { type: Type.STRING },
              weakTopics: { 
                type: Type.ARRAY, 
                items: { 
                  type: Type.OBJECT,
                  properties: {
                    topic: { type: Type.STRING },
                    reason: { type: Type.STRING }
                  },
                  required: ["topic", "reason"]
                }
              },
              strongTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
              subjectFeedback: {
                type: Type.OBJECT,
                properties: {
                  Physics: { type: Type.STRING },
                  Chemistry: { type: Type.STRING },
                  Biology: { type: Type.STRING }
                },
                required: ["Physics", "Chemistry", "Biology"]
              },
              roadmap: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["rankPrediction", "conceptualAnalysis", "weakTopics", "strongTopics", "subjectFeedback", "roadmap"]
          }
        }
      });

      const aiData = JSON.parse(response.text);

      // 3. Merge Data
      return {
        totalScore,
        maxScore,
        overallAccuracy,
        subjectWise: {
          Physics: stats.Physics,
          Chemistry: stats.Chemistry,
          Biology: stats.Biology
        },
        ...aiData
      };

    } catch (error) {
      console.error("Analysis generation failed", error);
      throw error; 
    }
  }, 'generateExamAnalysis');
};

export const analyzeDoubtImage = async (base64Image: string, prompt: string): Promise<string> => {
  return withRetry(async () => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: base64Image
              }
            },
            {
              text: `You are a strict NEET Tutor. Analyze this image. If it is a question, solve it step-by-step in Hindi. If it is a diagram, explain its significance in NCERT context. ${prompt}
              
              TEXT FORMATTING RULES (CRITICAL):
              All AI outputs MUST use plain readable text only.
              Do NOT use LaTeX math blocks, math delimiters, $...$, \\frac, \\lambda, \\nu, etc.
              Examples:
              - Instead of $YY$, write YY
              - Instead of $yy$, write yy
              - Instead of $Ttyy$, write Ttyy
              - Instead of $E = h\\nu$, write E = h × v
              - Instead of \\frac{hc}{\\lambda}, write E = h × c / lambda
              Genetics symbols must appear plainly: TT, Tt, tt, YY, Yy, yy, TtYy. No special symbols around them.
              All formulas, genetics symbols, and equations must be plain text. No LaTeX or mathematical markup should appear anywhere.`
            }
          ]
        },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
        }
      });
      return response.text || "Could not analyze the image.";
    } catch (error) {
      console.error("Error analyzing image:", error);
      throw error;
    }
  }, 'analyzeDoubtImage').catch(err => "Error analyzing image. Please try again later.");
};

export const analyzePYQTrends = async (subject: string, chapter: string | null): Promise<string> => {
  return withRetry(async () => {
    try {
      const prompt = `
        Act as an expert NEET exam analyst.
        Analyze the Previous Year Questions (PYQ) trends for NEET ${subject}${chapter ? ` specifically for the chapter "${chapter}"` : ''}.
        
        Provide a detailed analysis in Hindi and English (Hinglish) including:
        1. Weightage trend over the last 5-10 years (average number of questions).
        2. Most frequently asked concepts/topics.
        3. Difficulty level trend (Easy/Medium/Hard).
        4. Expected number of questions in NEET 2026.
        5. Pro-tips for studying this ${chapter ? 'chapter' : 'subject'} for NEET.
        
        Format the output using Markdown for readability. Use clear headings, bullet points, and bold text for emphasis.

        TEXT FORMATTING RULES (CRITICAL):
        All AI outputs MUST use plain readable text only.
        Do NOT use LaTeX math blocks, math delimiters, $...$, \\frac, \\lambda, \\nu, etc.
        Examples:
        - Instead of $YY$, write YY
        - Instead of $yy$, write yy
        - Instead of $Ttyy$, write Ttyy
        - Instead of $E = h\\nu$, write E = h × v
        - Instead of \\frac{hc}{\\lambda}, write E = h × c / lambda
        Genetics symbols must appear plainly: TT, Tt, tt, YY, Yy, yy, TtYy. No special symbols around them.
        All formulas, genetics symbols, and equations must be plain text. No LaTeX or mathematical markup should appear anywhere.
      `;
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });
      
      let resultText = response.text || "Could not generate trends.";
      
      // Extract grounding URLs
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (chunks && chunks.length > 0) {
        resultText += "\n\n### Sources\n";
        const uniqueUrls = new Set<string>();
        chunks.forEach(chunk => {
          if (chunk.web?.uri && chunk.web?.title) {
            if (!uniqueUrls.has(chunk.web.uri)) {
              uniqueUrls.add(chunk.web.uri);
              resultText += `- [${chunk.web.title}](${chunk.web.uri})\n`;
            }
          }
        });
      }
      
      return resultText;
    } catch (error) {
      console.error("Error generating PYQ trends:", error);
      throw error;
    }
  }, 'analyzePYQTrends').catch(err => "Error analyzing trends. Please try again later.");
};

export const debateQuestion = async (
  questionText: string,
  options: string[],
  correctAnswerIndex: number,
  userAnswerIndex: number | undefined,
  solution: string,
  userQuery: string,
  previousMessages: { role: 'user' | 'model', text: string }[]
): Promise<string> => {
  return withRetry(async () => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const chat = ai.chats.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: `You are an expert NEET tutor. A student is debating or asking a doubt about a question they attempted.
          
Question: ${questionText}
Options:
${options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join('\n')}

Correct Answer: ${String.fromCharCode(65 + correctAnswerIndex)}
User's Answer: ${userAnswerIndex !== undefined ? String.fromCharCode(65 + userAnswerIndex) : 'Skipped'}
Official Explanation: ${solution}

Rules for your response:
1. Explain the correct concept clearly.
2. Compare the user's answer vs the correct answer.
3. Use NCERT reference when possible.
4. Break the explanation into simple steps (e.g., Step 1: Analyze Assertion, Step 2: Analyze Reason, etc.).
5. Be encouraging but firm about the correct concept.
6. Keep it concise and focused on the student's specific doubt.

TEXT FORMATTING RULES (CRITICAL):
All AI outputs MUST use plain readable text only.
Do NOT use LaTeX math blocks, math delimiters, $...$, \\frac, \\lambda, \\nu, etc.
Examples:
- Instead of $YY$, write YY
- Instead of $yy$, write yy
- Instead of $Ttyy$, write Ttyy
- Instead of $E = h\\nu$, write E = h × v
- Instead of \\frac{hc}{\\lambda}, write E = h × c / lambda
Genetics symbols must appear plainly: TT, Tt, tt, YY, Yy, yy, TtYy. No special symbols around them.
All formulas, genetics symbols, and equations must be plain text. No LaTeX or mathematical markup should appear anywhere.`,
        },
      });

      // Send previous messages to establish context
      for (const msg of previousMessages) {
        if (msg.role === 'user') {
          await chat.sendMessage({ message: msg.text });
        } else {
          // Note: The Gemini SDK chat interface doesn't easily allow injecting model history directly like this in all versions,
          // but if it's a new chat, we can just pass the whole history as a single prompt if needed.
          // Let's just send the user query with the context of previous messages if any.
        }
      }

      // To handle history properly with the SDK, we can just format the history into the current prompt.
      const historyContext = previousMessages.length > 0 
        ? `\n\nPrevious Discussion:\n${previousMessages.map(m => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.text}`).join('\n')}\n\n`
        : '';

      const finalPrompt = `${historyContext}Student's new query: ${userQuery}`;

      const response = await chat.sendMessage({ message: finalPrompt });
      return response.text || "I couldn't generate a response. Please try again.";
    } catch (error) {
      console.error("Error in debateQuestion:", error);
      throw error;
    }
  }, 'debateQuestion').catch(err => "Error connecting to the tutor. Please try again later.");
};

export const playTextToSpeech = async (text: string): Promise<void> => {
  return withRetry(async () => {
    try {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' }, 
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) throw new Error("No audio data returned");

      const audioBuffer = await decodeAudioData(
        decode(base64Audio),
        ctx,
        24000,
        1,
      );

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.start();

    } catch (error) {
      console.error("TTS Error:", error);
      throw error;
    }
  }, 'playTextToSpeech').catch(err => console.error("TTS failed after retries", err));
};
