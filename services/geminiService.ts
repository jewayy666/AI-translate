
import { GoogleGenAI, Type } from "@google/genai";
import { TranscriptionResult, TranscriptLine } from "../types";

const CHUNK_DURATION_LIMIT = 300; // 5 minutes in seconds
const OVERLAP_DURATION = 2; // 2 seconds overlap
const MAX_CONCURRENCY = 4; // Moderate concurrency for stability

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
 * Converts an AudioBuffer to a WAV Blob.
 */
function bufferToWav(abuffer: AudioBuffer): Blob {
  const numOfChan = abuffer.numberOfChannels;
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

  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM
  setUint16(numOfChan);
  setUint32(abuffer.sampleRate);
  setUint32(abuffer.sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2);
  setUint16(16);

  setUint32(0x61746164); // "data" chunk
  setUint32(length - pos - 4);

  for (i = 0; i < numOfChan; i++) channels.push(abuffer.getChannelData(i));

  while (pos < length) {
    for (i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export class GeminiService {
  async transcribeChunk(
    base64Data: string,
    mimeType: string,
    chunkStartTime: number
  ): Promise<TranscriptionResult> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const prompt = `
      You are a high-precision audio transcription engine.
      This audio clip is part of a longer recording.
      
      CLIP GLOBAL START OFFSET: ${chunkStartTime.toFixed(2)} seconds.
      
      CRITICAL TASK:
      1. Provide a millisecond-accurate English transcript.
      2. For every segment, capture start and end timestamps.
      3. All timestamps must be GLOBAL.
         Global Time = ${chunkStartTime.toFixed(2)} + Relative Time within this specific clip.
      4. Provide a natural Traditional Chinese translation for each segment.
      
      STRICT TIMESTAMP RULES:
      - Do NOT trim or ignore any silence at the beginning of the audio file. 
      - If the audio starts with 5 seconds of silence and the first word is spoken at 00:05 relative to this clip, the global timestamp for that word MUST be (${chunkStartTime.toFixed(2)} + 5.00).
      - Your timestamps must align perfectly with the raw audio waveform provided.
      - 'startTimeInSeconds' and 'endTimeInSeconds' MUST be floats (numbers).
      
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
      console.error("Transcription chunk error:", error);
      throw error;
    }
  }

  async processAudio(
    file: File,
    onProgress: (status: string, progress: number) => void
  ): Promise<TranscriptionResult> {
    onProgress("正在解碼音訊文件 (精準對位中)...", 5);

    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await file.arrayBuffer();
    const fullBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const duration = fullBuffer.duration;

    const chunks: { blob: Blob; startTime: number }[] = [];
    
    onProgress("正在分割音訊區塊...", 10);

    for (let start = 0; start < duration; start += CHUNK_DURATION_LIMIT) {
      const end = Math.min(start + CHUNK_DURATION_LIMIT + OVERLAP_DURATION, duration);
      const sliceLength = Math.floor((end - start) * fullBuffer.sampleRate);
      
      const subBuffer = audioCtx.createBuffer(
        fullBuffer.numberOfChannels,
        sliceLength,
        fullBuffer.sampleRate
      );

      for (let ch = 0; ch < fullBuffer.numberOfChannels; ch++) {
        const sourceData = fullBuffer.getChannelData(ch);
        const startSample = Math.floor(start * fullBuffer.sampleRate);
        const endSample = Math.floor(end * fullBuffer.sampleRate);
        const subData = sourceData.subarray(startSample, endSample);
        subBuffer.copyToChannel(subData, ch);
      }

      chunks.push({
        blob: bufferToWav(subBuffer),
        startTime: start,
      });
    }

    onProgress(`準備發送到並行分析引擎 (共 ${chunks.length} 個區塊)...`, 15);

    const fullResult: TranscriptionResult = { transcript: [], vocabulary: [] };
    const results: TranscriptionResult[] = new Array(chunks.length);
    let completedCount = 0;

    const tasks = chunks.map(async (chunk, index) => {
      // Use a basic semaphore logic for concurrency
      while (completedCount - results.filter(r => r).length >= MAX_CONCURRENCY) {
        await new Promise(r => setTimeout(r, 100));
      }

      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
        reader.readAsDataURL(chunk.blob);
      });

      const base64 = await base64Promise;
      try {
        const result = await this.transcribeChunk(base64, "audio/wav", chunk.startTime);
        results[index] = result;
      } catch (e) {
        console.error(`Chunk ${index} failed:`, e);
        results[index] = { transcript: [], vocabulary: [] };
      }

      completedCount++;
      onProgress(
        `並行分析中 (${completedCount}/${chunks.length})...`,
        Math.floor((completedCount / chunks.length) * 80) + 15
      );
    });

    await Promise.all(tasks);

    onProgress("整合全域時間線...", 98);

    results.forEach((chunkResult) => {
      if (!chunkResult) return;

      (chunkResult.transcript || []).forEach((newLine) => {
        // Strict timestamp check to filter out data from overlap zones
        const isDuplicate = fullResult.transcript.some(
          (existingLine) =>
            Math.abs(existingLine.startTimeInSeconds - newLine.startTimeInSeconds) < 0.2 &&
            existingLine.english.substring(0, 10).toLowerCase() ===
              newLine.english.substring(0, 10).toLowerCase()
        );
        if (!isDuplicate) {
          fullResult.transcript.push(newLine);
        }
      });

      (chunkResult.vocabulary || []).forEach((item) => {
        if (
          !fullResult.vocabulary.find(
            (v) => v.word.toLowerCase() === item.word.toLowerCase()
          )
        ) {
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
