
import { GoogleGenAI, Type } from "@google/genai";
import { TranscriptionResult, TranscriptLine } from "../types";

// Constants for Tiled Transcription
const CHUNK_DURATION = 180; // 3 minutes for optimal focus
const OVERLAP_DURATION = 20; // 20s overlap to provide context for boundary sentences
const STEP_SIZE = CHUNK_DURATION - OVERLAP_DURATION; // 160s step size
const MAX_CONCURRENCY = 2; 

export const parseTimeToSeconds = (time: string | number): number => {
  if (typeof time === 'number') return time;
  if (!time) return 0;
  const parts = String(time).split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parseFloat(String(time)) || 0;
};

/**
 * Converts an AudioBuffer to a WAV Blob (PCM 16-bit, 16000Hz, Mono).
 * This ensures the audio data length exactly matches the expected duration.
 */
function bufferToWav(abuffer: AudioBuffer): Blob {
  const numOfChan = 1;
  const sampleRate = 16000;
  const length = abuffer.length * numOfChan * 2 + 44;
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  let pos = 0;

  function setUint16(data: number) { view.setUint16(pos, data, true); pos += 2; }
  function setUint32(data: number) { view.setUint32(pos, data, true); pos += 4; }

  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); 
  setUint32(0x45564157); // "WAVE"
  setUint32(0x20746d66); // "fmt "
  setUint32(16);
  setUint16(1); // PCM
  setUint16(numOfChan);
  setUint32(sampleRate);
  setUint32(sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2);
  setUint16(16);
  setUint32(0x61746164); // "data"
  setUint32(length - pos - 4);

  const channelData = abuffer.getChannelData(0);
  for (let i = 0; i < abuffer.length; i++) {
    let sample = Math.max(-1, Math.min(1, channelData[i]));
    sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    view.setInt16(pos, sample, true);
    pos += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export class GeminiService {
  async transcribeChunk(
    base64Data: string,
    mimeType: string,
    chunkIndex: number,
    clipDuration: number
  ): Promise<TranscriptionResult> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const prompt = `
      You are a professional verbatim transcriber. Your task is to transcribe this audio chunk (Chunk #${chunkIndex}) with absolute precision.
      
      STRICT VERBATIM REQUIREMENTS:
      1. **NO SKIPPING:** Transcribe every single word. Do not omit any section, even if it is quiet or redundant.
      2. **NO SUMMARIZATION:** Never paraphrase or summarize. Transcribe exactly what is spoken word-for-word.
      3. **UNINTELLIGIBLE PARTS:** If a phrase is truly unintelligible, mark it as [unintelligible].
      
      TIMING & BOUNDARY RULES:
      - This clip is exactly ${clipDuration.toFixed(2)} seconds long.
      - 0.00s is the absolute start of this clip.
      - If a sentence begins at the very end of the clip, transcribe it as much as you can.
      - Ensure your timestamps are accurate to the 16kHz audio samples.
      
      TASK:
      - Transcribe all English speech.
      - Identify speakers (e.g., GAVIN, HOST).
      - Provide a natural Traditional Chinese (Taiwan) translation.
      - Extract B2+ level academic vocabulary.

      Return ONLY JSON:
      {
        "transcript": [{ "speaker": "Speaker", "english": "Text", "chinese": "翻譯", "startTimeInSeconds": 0.00, "endTimeInSeconds": 0.00 }],
        "vocabulary": [...]
      }
    `;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: base64Data } }] }],
        config: {
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 8000 },
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
                    endTimeInSeconds: { type: Type.NUMBER },
                  },
                  required: ["speaker", "english", "chinese", "startTimeInSeconds", "endTimeInSeconds"],
                },
              },
              vocabulary: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    word: { type: Type.STRING },
                    ipa: { type: Type.STRING },
                    definition: { type: Type.STRING },
                    example: { type: Type.STRING },
                  },
                  required: ["word", "ipa", "definition", "example"],
                },
              },
            },
            required: ["transcript", "vocabulary"],
          },
        },
      });

      const parsed = JSON.parse(response.text || "{}") as TranscriptionResult;
      parsed.transcript = (parsed.transcript || []).map(line => ({
        ...line,
        startTimeInSeconds: parseTimeToSeconds(line.startTimeInSeconds),
        endTimeInSeconds: parseTimeToSeconds(line.endTimeInSeconds),
      }));
      return parsed;
    } catch (error) {
      console.error(`Gemini Error on Chunk ${chunkIndex}:`, error);
      throw error;
    }
  }

  async processAudio(
    file: File,
    onProgress: (status: string, progress: number) => void
  ): Promise<TranscriptionResult> {
    onProgress("正在解碼原始音訊檔案 (16kHz Mono)...", 5);

    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    const arrayBuffer = await file.arrayBuffer();
    const fullBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const totalDuration = fullBuffer.duration;

    const chunks: { blob: Blob; duration: number }[] = [];
    onProgress("正在產生無損分析區塊...", 10);

    for (let start = 0; start < totalDuration; start += STEP_SIZE) {
      const end = Math.min(start + CHUNK_DURATION, totalDuration);
      const sliceLength = Math.floor((end - start) * audioCtx.sampleRate);
      const subBuffer = audioCtx.createBuffer(1, sliceLength, audioCtx.sampleRate);
      const startSample = Math.floor(start * audioCtx.sampleRate);
      subBuffer.copyToChannel(fullBuffer.getChannelData(0).slice(startSample, startSample + sliceLength), 0);
      chunks.push({ blob: bufferToWav(subBuffer), duration: end - start });
      if (end >= totalDuration) break;
    }

    const fullResult: TranscriptionResult = { transcript: [], vocabulary: [] };
    const chunkResults: TranscriptionResult[] = new Array(chunks.length);
    let completedCount = 0;

    onProgress(`啟動 AI 逐字稿分析 (共 ${chunks.length} 個區塊)...`, 15);

    const tasks = chunks.map(async (chunk, index) => {
      await new Promise(r => setTimeout(r, index * 200)); // Staggered start
      while (completedCount - chunkResults.filter(r => r).length >= MAX_CONCURRENCY) {
        await new Promise(r => setTimeout(r, 500));
      }

      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
        reader.readAsDataURL(chunk.blob);
      });

      try {
        const base64 = await base64Promise;
        chunkResults[index] = await this.transcribeChunk(base64, "audio/wav", index, chunk.duration);
      } catch (e) {
        chunkResults[index] = { transcript: [], vocabulary: [] };
      }

      completedCount++;
      onProgress(`AI 分析中 (${completedCount}/${chunks.length})...`, Math.floor((completedCount / chunks.length) * 80) + 15);
    });

    await Promise.all(tasks);

    onProgress("整合全域時間軸並校正無縫銜接...", 98);

    chunkResults.forEach((result, index) => {
      if (!result) return;
      const globalOffset = index * STEP_SIZE;
      
      result.transcript.forEach((line) => {
        // Tiled Ownership Logic: 
        // A chunk "owns" any sentence that starts within its exclusive tile [0, STEP_SIZE).
        // The last chunk owns everything remaining.
        const isLastChunk = index === chunks.length - 1;
        const startsInThisTile = line.startTimeInSeconds < STEP_SIZE;

        if (isLastChunk || startsInThisTile) {
          fullResult.transcript.push({
            ...line,
            startTimeInSeconds: globalOffset + line.startTimeInSeconds,
            endTimeInSeconds: globalOffset + line.endTimeInSeconds
          });
        }
      });

      result.vocabulary.forEach((item) => {
        if (!fullResult.vocabulary.some(v => v.word.toLowerCase() === item.word.toLowerCase())) {
          fullResult.vocabulary.push(item);
        }
      });
    });

    fullResult.transcript.sort((a, b) => a.startTimeInSeconds - b.startTimeInSeconds);
    audioCtx.close();
    onProgress("全域同步完成！", 100);
    return fullResult;
  }
}
