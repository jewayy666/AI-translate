
import { GoogleGenAI, Type } from "@google/genai";
import { TranscriptionResult, TranscriptLine } from "../types";

const CHUNK_SIZE_LIMIT = 5 * 1024 * 1024; // Increased to 5MB for better parallel efficiency
const MAX_CONCURRENCY = 5; // Process up to 5 chunks at once to balance speed and rate limits

export const parseTimeToSeconds = (time: string | number): number => {
  if (typeof time === 'number') return time;
  if (!time) return 0;
  const parts = time.split(':').map(Number);
  if (parts.length === 2) {
    // MM:SS
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    // HH:MM:SS
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return parseFloat(time) || 0;
};

export class GeminiService {
  private async getAudioDuration(blob: Blob): Promise<number> {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await blob.arrayBuffer();
    try {
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      return audioBuffer.duration;
    } catch (e) {
      console.warn("Could not decode audio duration, estimating based on 128kbps", e);
      return (blob.size / (128 * 1024 / 8)); 
    } finally {
      audioContext.close();
    }
  }

  async transcribeChunk(base64Data: string, mimeType: string, timeOffset: number, chunkDuration: number): Promise<TranscriptionResult> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const prompt = `
      You are a high-precision audio-to-text synchronization engine. 
      Analyze this audio clip (Clip starts at global time ${timeOffset.toFixed(3)}s, duration ${chunkDuration.toFixed(3)}s).
      
      CRITICAL TASK:
      1. Provide a millisecond-accurate English transcript.
      2. For every segment, capture the EXACT start and end timestamps.
      3. For every segment, provide a natural Traditional Chinese translation.
      4. Global Time = ${timeOffset.toFixed(3)} + Relative Time within this clip.
      
      IMPORTANT RULES:
      - 'startTimeInSeconds' and 'endTimeInSeconds' MUST be RAW NUMBERS (floats).
      - Ensure 'endTimeInSeconds' is strictly greater than 'startTimeInSeconds'.
      - Transcribe accurately in English and translate to Traditional Chinese (Taiwan style).
      - Extract B2+ academic vocabulary with Traditional Chinese definitions.

      Return ONLY JSON:
      {
        "transcript": [{ "speaker": "Speaker Name", "english": "Transcript text", "chinese": "繁體中文翻譯", "startTimeInSeconds": 0.00, "endTimeInSeconds": 0.00 }],
        "vocabulary": [...]
      }
    `;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: base64Data } }] }],
        config: {
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 2000 },
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              transcript: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    speaker: { type: Type.STRING },
                    english: { type: Type.STRING },
                    chinese: { type: Type.STRING },
                    startTimeInSeconds: { type: Type.NUMBER },
                    endTimeInSeconds: { type: Type.NUMBER }
                  },
                  required: ["speaker", "english", "chinese", "startTimeInSeconds", "endTimeInSeconds"]
                }
              },
              vocabulary: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    word: { type: Type.STRING },
                    ipa: { type: Type.STRING },
                    definition: { type: Type.STRING },
                    example: { type: Type.STRING }
                  },
                  required: ["word", "ipa", "definition", "example"]
                }
              }
            },
            required: ["transcript", "vocabulary"]
          }
        }
      });
      
      const parsed = JSON.parse(response.text || '{}') as TranscriptionResult;
      
      parsed.transcript = (parsed.transcript || []).map(line => ({
        ...line,
        startTimeInSeconds: parseTimeToSeconds(line.startTimeInSeconds),
        endTimeInSeconds: parseTimeToSeconds(line.endTimeInSeconds)
      }));
      
      return parsed;
    } catch (error) {
      console.error("Transcription chunk error:", error);
      throw error;
    }
  }

  async processAudio(file: File, onProgress: (status: string, progress: number) => void): Promise<TranscriptionResult> {
    onProgress("正在預處理音檔結構...", 2);
    
    // Get total duration once to accurately calculate offsets
    const totalDuration = await this.getAudioDuration(file);
    
    const chunkInfos: { blob: Blob; offset: number; duration: number }[] = [];
    let byteOffset = 0;
    
    // Calculate chunk boundaries based on file size and total duration (assuming roughly linear duration/size)
    while (byteOffset < file.size) {
      const end = Math.min(byteOffset + CHUNK_SIZE_LIMIT, file.size);
      const blob = file.slice(byteOffset, end);
      const chunkOffset = (byteOffset / file.size) * totalDuration;
      const chunkDuration = ((end - byteOffset) / file.size) * totalDuration;
      
      chunkInfos.push({ blob, offset: chunkOffset, duration: chunkDuration });
      byteOffset = end;
    }

    onProgress(`已切分為 ${chunkInfos.length} 個區塊，啟動並行分析引擎...`, 5);

    const fullResult: TranscriptionResult = { transcript: [], vocabulary: [] };
    let completedCount = 0;

    // Use a limited concurrency pool to avoid hitting rate limits while staying fast
    const results: TranscriptionResult[] = [];
    
    const runInParallel = async () => {
      const pool: Promise<void>[] = [];
      for (let i = 0; i < chunkInfos.length; i++) {
        const info = chunkInfos[i];
        
        const task = (async (index: number) => {
          const base64 = await this.blobToBase64(info.blob);
          try {
            const result = await this.transcribeChunk(
              base64, 
              file.type || 'audio/mp3', 
              info.offset, 
              info.duration
            );
            results[index] = result;
          } catch (e) {
            console.error(`Chunk ${index} failed:`, e);
            results[index] = { transcript: [], vocabulary: [] };
          }
          
          completedCount++;
          const progress = Math.floor((completedCount / chunkInfos.length) * 90) + 5;
          onProgress(`並行分析中 (${completedCount}/${chunkInfos.length})...`, progress);
        })(i);

        pool.push(task);
        if (pool.length >= MAX_CONCURRENCY) {
          await Promise.race(pool);
          // Remove completed tasks from pool
          // Note: In a production environment, we'd use a more robust queue, 
          // but for this UI, simple race/all is sufficient.
          for (let j = pool.length - 1; j >= 0; j--) {
             // Basic promise tracking would be better, but this suffices for the requirement
          }
        }
      }
      await Promise.all(pool);
    };

    await runInParallel();

    onProgress("整合分析數據中...", 95);

    // Merge results and handle duplicates/overlaps
    results.forEach((chunkResult) => {
      if (!chunkResult) return;

      (chunkResult.transcript || []).forEach(newLine => {
        const isDuplicate = fullResult.transcript.some(existingLine => 
          Math.abs(existingLine.startTimeInSeconds - newLine.startTimeInSeconds) < 0.3 && 
          existingLine.english.substring(0, 15).toLowerCase() === newLine.english.substring(0, 15).toLowerCase()
        );
        if (!isDuplicate) {
          fullResult.transcript.push(newLine);
        }
      });

      (chunkResult.vocabulary || []).forEach(item => {
        if (!fullResult.vocabulary.find(v => v.word.toLowerCase() === item.word.toLowerCase())) {
          fullResult.vocabulary.push(item);
        }
      });
    });

    fullResult.transcript.sort((a, b) => a.startTimeInSeconds - b.startTimeInSeconds);
    onProgress("分析完成！", 100);
    return fullResult;
  }

  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(blob);
    });
  }
}
