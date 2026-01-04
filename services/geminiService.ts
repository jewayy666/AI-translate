
import { GoogleGenAI, Type } from "@google/genai";
import { TranscriptionResult } from "../types";

const CHUNK_SIZE_LIMIT = 10 * 1024 * 1024; // 10MB chunk limit for inline data safely

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  /**
   * Transcribes a single chunk of audio data.
   */
  async transcribeChunk(base64Data: string, mimeType: string, isFirst: boolean, isLast: boolean): Promise<TranscriptionResult> {
    const prompt = `
      You are an expert transcriber and language teacher. 
      Analyze the provided audio. 
      
      Tasks:
      1. Transcribe the audio in English.
      2. Identify and distinguish between different speakers (e.g., Speaker 1, Speaker 2).
      3. For every sentence, provide a Traditional Chinese translation.
      4. Extract "High School level and above" (CEFR B2/C1/C2) English vocabulary found in this audio.
      5. Provide the word, International Phonetic Alphabet (IPA), its meaning in Traditional Chinese, and an example sentence from the context.

      Return the result strictly in JSON format matching this schema:
      {
        "transcript": [
          { "speaker": "Speaker Name", "english": "English sentence", "chinese": "繁體中文翻譯" }
        ],
        "vocabulary": [
          { "word": "word", "ipa": "/phonetic/", "definition": "繁體中文解釋", "example": "Example sentence using the word." }
        ]
      }
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: mimeType,
                  data: base64Data
                }
              }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
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
                    chinese: { type: Type.STRING }
                  },
                  required: ["speaker", "english", "chinese"]
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

      const text = response.text || '{}';
      return JSON.parse(text) as TranscriptionResult;
    } catch (error) {
      console.error("Gemini Transcription Error:", error);
      throw error;
    }
  }

  /**
   * Handles splitting logic and sequential transcription for large files.
   */
  async processAudio(file: File, onProgress: (status: string, progress: number) => void): Promise<TranscriptionResult> {
    const chunks: Blob[] = [];
    let offset = 0;

    onProgress("正在分割音檔...", 10);
    while (offset < file.size) {
      chunks.push(file.slice(offset, offset + CHUNK_SIZE_LIMIT));
      offset += CHUNK_SIZE_LIMIT;
    }

    const fullResult: TranscriptionResult = {
      transcript: [],
      vocabulary: []
    };

    for (let i = 0; i < chunks.length; i++) {
      const progressPercent = 20 + Math.floor((i / chunks.length) * 70);
      onProgress(`正在處理第 ${i + 1}/${chunks.length} 段音檔...`, progressPercent);
      
      const base64 = await this.blobToBase64(chunks[i]);
      const result = await this.transcribeChunk(
        base64, 
        file.type || 'audio/mp3', 
        i === 0, 
        i === chunks.length - 1
      );

      fullResult.transcript.push(...result.transcript);
      
      // Deduplicate vocabulary
      result.vocabulary.forEach(item => {
        if (!fullResult.vocabulary.find(v => v.word.toLowerCase() === item.word.toLowerCase())) {
          fullResult.vocabulary.push(item);
        }
      });
    }

    onProgress("處理完成！", 100);
    return fullResult;
  }

  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}
