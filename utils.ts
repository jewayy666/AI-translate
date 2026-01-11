
import { TranscriptLine, DialogueSegment } from './types';

/**
 * 檢查是否包含中文字元（包含標點符號）
 */
export const isChineseChar = (str: string) => {
  return /[\u4e00-\u9fa5]|[\u3000-\u303f]|[\uff01-\uff0f]|[\uff1a-\uff20]/.test(str);
};

/**
 * 高級解析器：將逐字稿轉換為結構化資料。
 * 1. 以時間戳記 (00:00) 分隔區塊。
 * 2. 在區塊內區分英文對話與中文對話。
 * 3. 根據說話者順序自動配對英中內容。
 */
export const parseTranscript = (text: string): TranscriptLine[] => {
  const blocks: TranscriptLine[] = [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l);
  
  const timeRegex = /^(\d{1,2}):(\d{2})$/;
  const speakerRegex = /^([^:：]+)[:：]\s*(.*)$/;

  let rawBlocks: { timestamp: string, startTime: number, contentLines: string[] }[] = [];
  let currentRawBlock: { timestamp: string, startTime: number, contentLines: string[] } | null = null;

  // 第一階段：按時間戳記切分原始區塊
  for (const line of lines) {
    const timeMatch = line.match(timeRegex);
    if (timeMatch) {
      const startTime = parseInt(timeMatch[1], 10) * 60 + parseInt(timeMatch[2], 10);
      currentRawBlock = {
        timestamp: line,
        startTime,
        contentLines: []
      };
      rawBlocks.push(currentRawBlock);
    } else if (currentRawBlock) {
      currentRawBlock.contentLines.push(line);
    }
  }

  // 第二階段：處理每個區塊內的英中配對
  for (const raw of rawBlocks) {
    const englishSegments: { speaker: string, text: string }[] = [];
    const chineseSegments: { speaker: string, text: string }[] = [];

    let lastSpeaker = "";
    let lastIsChinese = false;

    for (const line of raw.contentLines) {
      const speakerMatch = line.match(speakerRegex);
      
      if (speakerMatch) {
        const speaker = speakerMatch[1].trim();
        const content = speakerMatch[2].trim();
        const isChinese = isChineseChar(content);
        
        if (isChinese) {
          chineseSegments.push({ speaker, text: content });
        } else {
          englishSegments.push({ speaker, text: content });
        }
        
        lastSpeaker = speaker;
        lastIsChinese = isChinese;
      } else {
        // 延續上一行的內容
        const targetList = lastIsChinese ? chineseSegments : englishSegments;
        if (targetList.length > 0) {
          targetList[targetList.length - 1].text += "\n" + line;
        }
      }
    }

    // 配對邏輯：將英文段落與中文段落按順序合併
    // 優先尋找說話者相同的對應行，若無法完全匹配則按出現順序配對
    const mergedSegments: DialogueSegment[] = [];
    const usedChineseIdx = new Set<number>();

    for (let i = 0; i < englishSegments.length; i++) {
      const eng = englishSegments[i];
      // 尋找下一個未使用的、說話者相同的中文段落
      let chiIdx = -1;
      for (let j = 0; j < chineseSegments.length; j++) {
        if (!usedChineseIdx.has(j) && chineseSegments[j].speaker === eng.speaker) {
          chiIdx = j;
          break;
        }
      }

      // 如果找不到相同說話者的中文，就拿順序最接近的一個（簡單後援）
      if (chiIdx === -1 && i < chineseSegments.length && !usedChineseIdx.has(i)) {
        chiIdx = i;
      }

      if (chiIdx !== -1) {
        // Fix: Added missing highlights property to satisfy DialogueSegment type
        mergedSegments.push({
          speaker: eng.speaker,
          english: eng.text,
          chinese: chineseSegments[chiIdx].text,
          highlights: []
        });
        usedChineseIdx.add(chiIdx);
      } else {
        // Fix: Added missing highlights property to satisfy DialogueSegment type
        mergedSegments.push({
          speaker: eng.speaker,
          english: eng.text,
          chinese: "",
          highlights: []
        });
      }
    }

    // 處理剩餘沒配對到的中文（如果有）
    for (let j = 0; j < chineseSegments.length; j++) {
      if (!usedChineseIdx.has(j)) {
        // Fix: Added missing highlights property to satisfy DialogueSegment type
        mergedSegments.push({
          speaker: chineseSegments[j].speaker,
          english: "",
          chinese: chineseSegments[j].text,
          highlights: []
        });
      }
    }

    blocks.push({
      id: Math.random().toString(36).substr(2, 9),
      startTime: raw.startTime,
      timestamp: raw.timestamp,
      segments: mergedSegments
    });
  }

  return blocks.sort((a, b) => a.startTime - b.startTime);
};

export const formatTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  const parts = [];
  if (h > 0) parts.push(h.toString().padStart(2, '0'));
  parts.push(m.toString().padStart(2, '0'));
  parts.push(s.toString().padStart(2, '0'));

  return parts.join(':');
};