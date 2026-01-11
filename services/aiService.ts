
import { GoogleGenAI, Type } from "@google/genai";
import { Highlight } from "../types";

/**
 * 音訊處理輔助：AudioBuffer 轉 WAV 格式
 */
const audioBufferToWav = (buffer: AudioBuffer): Blob => {
  const length = buffer.length * 2;
  const bufferArray = new ArrayBuffer(44 + length);
  const view = new DataView(bufferArray);
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, length, true);
  const channelData = buffer.getChannelData(0);
  let offset = 44;
  for (let i = 0; i < channelData.length; i++) {
    const sample = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    offset += 2;
  }
  return new Blob([bufferArray], { type: 'audio/wav' });
};

/**
 * 音訊處理輔助：壓縮音訊以符合 API 限制
 */
const compressAudio = async (audioBlob: Blob): Promise<Blob> => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  const targetSampleRate = 16000;
  const offlineContext = new OfflineAudioContext(1, audioBuffer.duration * targetSampleRate, targetSampleRate);
  const source = offlineContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineContext.destination);
  source.start();
  const renderedBuffer = await offlineContext.startRendering();
  return audioBufferToWav(renderedBuffer);
};

/**
 * 輔助：Blob 轉 Base64
 */
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

/**
 * 取得 API Key 的輔助函式
 */
const getApiKey = () => {
  const apiKey = (import.meta as any).env?.VITE_GOOGLE_API_KEY || process.env.API_KEY;
  if (!apiKey || apiKey === 'undefined' || apiKey.trim() === '') {
    console.warn("未偵測到 VITE_GOOGLE_API_KEY，請檢查 Vercel 設定。");
    return null;
  }
  return apiKey;
};

/**
 * 查詢單字/片語詳細資訊
 */
export const lookupVocabulary = async (text: string): Promise<Highlight> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("需要 API Key 才能使用 AI 查詢功能。");
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Explain the English text "${text}" for an English learner. 
Output strictly in JSON format with these fields:
- text: the original text
- translation: Traditional Chinese meaning (zh-TW)
- ipa: phonetic symbols (IPA or KK)
- example: a short, useful example sentence in English
- type: either "word" or "phrase"`,
    config: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          translation: { type: Type.STRING },
          ipa: { type: Type.STRING },
          example: { type: Type.STRING },
          type: { type: Type.STRING, enum: ["word", "phrase"] }
        },
        required: ["text", "translation", "ipa", "example", "type"]
      }
    }
  });

  try {
    const data = JSON.parse(response.text);
    return {
      text: data.text,
      meaning: data.translation,
      ipa: data.ipa,
      example: data.example,
      type: data.type as 'word' | 'phrase'
    };
  } catch (err) {
    console.error("Lookup JSON Parse Error:", err);
    throw new Error("AI 查詢結果解析失敗。");
  }
};

/**
 * 核心：生成逐字稿與分析
 */
export const generateTranscript = async (audioBlob: Blob) => {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new Error(
      "未偵測到有效的 API Key。\n\n" +
      "1. 如果您正在使用自動分析模式：請在環境變數中設定 VITE_GOOGLE_API_KEY。\n" +
      "2. 如果您沒有 API Key：請在匯入時提供 JSON 內容即可直接播放。"
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const compressedBlob = await compressAudio(audioBlob);
  const base64Audio = await blobToBase64(compressedBlob);

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview", 
    contents: [
      {
        parts: [
          { inlineData: { mimeType: "audio/wav", data: base64Audio } },
          {
            text: `Role: Professional English Language Expert. 
Task: Transcribe audio and analyze vocabulary for learners.
Rules:
1. Divide into 5-10s segments.
2. For each segment, provide English text and Traditional Chinese (zh-TW) translation.
3. LANGUAGE ANALYSIS: Identify keywords or phrases (CEFR B1+).
4. For each keyword/phrase, provide: exact text, IPA, Chinese meaning, and a clear example sentence.
5. Format: Strict JSON array.`,
          },
        ],
      },
    ],
    config: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            startTime: { type: Type.STRING },
            endTime: { type: Type.STRING },
            speaker: { type: Type.STRING },
            en: { type: Type.STRING },
            zh: { type: Type.STRING },
            highlights: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  ipa: { type: Type.STRING },
                  meaning: { type: Type.STRING },
                  example: { type: Type.STRING },
                  type: { type: Type.STRING, enum: ["word", "phrase"] }
                },
                required: ["text", "meaning", "example", "type"]
              }
            }
          },
          required: ["startTime", "endTime", "speaker", "en", "zh", "highlights"],
        },
      },
    },
  });

  try {
    const resultText = response.text;
    if (!resultText) throw new Error("AI 回傳內容為空。");
    return JSON.parse(resultText);
  } catch (err) {
    console.error("AI JSON Parse Error:", err);
    throw new Error("AI 語言分析結果解析失敗，請稍後再試。");
  }
};
