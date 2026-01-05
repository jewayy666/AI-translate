
import { GoogleGenAI, Type } from "@google/genai";
import { TranscriptionResult, TranscriptLine } from "../types";

// deterministic constants for synchronization
const CHUNK_DURATION = 300; // 300s (5 minutes)
const OVERLAP_DURATION = 15; // 15s overlap
const STEP_SIZE = CHUNK_DURATION - OVERLAP_DURATION; // 285s step
const MAX_CONCURRENCY = 3; // Maintain stability with high-quality transcoding

export const parseTimeToSeconds = (time: string | number): number => {
  if (typeof time === 'number') return time;
  if (!time) return 0;
  const parts = time.split(':').map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return parseFloat(time) || 0;
};

/**
 * Converts an AudioBuffer to a WAV Blob (PCM 16-bit, 16000Hz, Mono).
 * This ensures "1 sec of data = 1 sec of time" perfectly, eliminating VBR drift.
 */
function bufferToWav(abuffer: AudioBuffer): Blob {
  const numOfChan = 1; // Mono as requested
  const sampleRate = 16000; // 16000Hz as requested
  
  // We need to resample if the context is different, but for simplicity 
  // we'll assume the subBuffer created in processAudio already matches these specs.
  const length = abuffer.length * numOfChan * 2 + 44;
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  const channels = [];
  let i;
  let sample;
  let offset = 0;
  let pos = 0;

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }

  // RIFF header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); 
  setUint32(0x45564157); // "WAVE"

  // fmt chunk
  setUint32(0x20746d66); // "fmt "
  setUint32(16); // length
  setUint16(1); // PCM
  setUint16(numOfChan);
  setUint32(sampleRate);
  setUint32(sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2);
  setUint16(16); // 16-bit

  // data chunk
  setUint32(0x61746164); // "data"
  setUint32(length - pos - 4);

  // Write PCM data
  const channelData = abuffer.getChannelData(0); // Mono
  for (i = 0; i < abuffer.length; i++) {
    sample = Math.max(-1, Math.min(1, channelData[i]));
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
    chunkIndex: number
  ): Promise<TranscriptionResult> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const prompt = `
      You are a high-precision audio transcription engine.
      This audio clip is exactly part of a continuous sequence (Chunk #${chunkIndex}).
      
      CRITICAL TASK:
      1. Provide a millisecond-accurate English transcript.
      2. For every segment, capture start and end timestamps.
      3. Use RELATIVE timestamps starting from 0.00 for this specific clip.
      4. Provide a natural Traditional Chinese translation for each segment.
      
      STRICT TIMESTAMP RULES:
      - Do NOT trim silence at the beginning. If speech starts at 5.2s, use 5.20.
      - 'startTimeInSeconds' and 'endTimeInSeconds' MUST be numbers (floats).
      - Your output must align perfectly with the raw 16kHz PCM audio provided.
      
      CONTENT RULES:
      - Extract B2+ academic vocabulary with IPA and Traditional Chinese definitions.
      - Transcribe accurately in English and translate to Traditional Chinese (Taiwan style).

      Return ONLY JSON:
      {
        "transcript": [{ "speaker": "Speaker Name", "english": "Transcript text", "chinese": "繁體中文翻譯", "startTimeInSeconds": 0.00, "endTimeInSeconds": 0.00 }],
        "vocabulary": [...]
      }
    `;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          { parts: [{ text: prompt }, { inlineData: { mimeType, data: base64Data } }] },
        ],
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

      parsed.transcript = (parsed.transcript || []).map((line) => ({
        ...line,
        startTimeInSeconds: parseTimeToSeconds(line.startTimeInSeconds),
        endTimeInSeconds: parseTimeToSeconds(line.endTimeInSeconds),
      }));

      return parsed;
    } catch (error) {
      console.error(`Transcription error for Chunk ${chunkIndex}:`, error);
      throw error;
    }
  }

  async processAudio(
    file: File,
    onProgress: (status: string, progress: number) => void
  ): Promise<TranscriptionResult> {
    onProgress("正在進行精準音訊解碼 (Transcoding to PCM 16kHz)...", 5);

    // Use AudioContext for high-precision resampling and decoding
    // This solves the VBR drift by converting everything to a standard PCM buffer first.
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 16000 // Force 16000Hz for deterministic processing
    });
    
    const arrayBuffer = await file.arrayBuffer();
    const fullBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const totalDuration = fullBuffer.duration;

    const chunkBlobs: Blob[] = [];
    
    onProgress("正在產生確定性音訊區塊 (Overlap: 15s)...", 10);

    // Splitting Logic using STEP_SIZE (285s) and CHUNK_DURATION (300s)
    for (let start = 0; start < totalDuration; start += STEP_SIZE) {
      const end = Math.min(start + CHUNK_DURATION, totalDuration);
      const sliceLength = Math.floor((end - start) * audioCtx.sampleRate);
      
      const subBuffer = audioCtx.createBuffer(
        1, // Mono
        sliceLength,
        audioCtx.sampleRate
      );

      const sourceData = fullBuffer.getChannelData(0); // Take first channel
      const startSample = Math.floor(start * audioCtx.sampleRate);
      const subData = sourceData.slice(startSample, startSample + sliceLength);
      subBuffer.copyToChannel(subData, 0);

      chunkBlobs.push(bufferToWav(subBuffer));
      
      // Stop if we've reached the end
      if (end >= totalDuration) break;
    }

    const fullResult: TranscriptionResult = { transcript: [], vocabulary: [] };
    const chunkResults: TranscriptionResult[] = new Array(chunkBlobs.length);
    let completedCount = 0;

    onProgress(`啟動並行分析 (共 ${chunkBlobs.length} 個區塊)...`, 15);

    const tasks = chunkBlobs.map(async (blob, index) => {
      // Concurrency control
      while (completedCount - chunkResults.filter(r => r).length >= MAX_CONCURRENCY) {
        await new Promise(r => setTimeout(r, 200));
      }

      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
        reader.readAsDataURL(blob);
      });

      const base64 = await base64Promise;
      try {
        const result = await this.transcribeChunk(base64, "audio/wav", index);
        chunkResults[index] = result;
      } catch (e) {
        console.error(`Chunk ${index} failed:`, e);
        chunkResults[index] = { transcript: [], vocabulary: [] };
      }

      completedCount++;
      onProgress(
        `並行處理中 (${completedCount}/${chunkBlobs.length})...`,
        Math.floor((completedCount / chunkBlobs.length) * 80) + 15
      );
    });

    await Promise.all(tasks);

    onProgress("執行強韌數據整合與去重...", 98);

    // Merging Logic (JSON Post-processing)
    chunkResults.forEach((result, index) => {
      if (!result) return;
      
      const offset = index * STEP_SIZE;
      
      (result.transcript || []).forEach((line) => {
        // For Chunk N > 0: Discard lines with relative timestamp < 15.0s
        if (index > 0 && line.startTimeInSeconds < OVERLAP_DURATION) {
          return;
        }

        // Adjust timestamps by global offset
        const globalLine: TranscriptLine = {
          ...line,
          startTimeInSeconds: offset + line.startTimeInSeconds,
          endTimeInSeconds: offset + line.endTimeInSeconds
        };

        fullResult.transcript.push(globalLine);
      });

      (result.vocabulary || []).forEach((item) => {
        if (!fullResult.vocabulary.find(v => v.word.toLowerCase() === item.word.toLowerCase())) {
          fullResult.vocabulary.push(item);
        }
      });
    });

    fullResult.transcript.sort((a, b) => a.startTimeInSeconds - b.startTimeInSeconds);
    audioCtx.close();
    
    onProgress("分析完成！", 100);
    return fullResult;
  }
}
