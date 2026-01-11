
import React, { useState, useRef, useEffect } from 'react';
import { HistoryItem, TranscriptLine, Highlight } from '../types';
import { saveItem } from '../services/storageService';
import { generateTranscript } from '../services/aiService';

interface ImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (item: HistoryItem) => void;
}

type ImportMode = 'json';

const ImportDialog: React.FC<ImportDialogProps> = ({ isOpen, onClose, onImportComplete }) => {
  const [name, setName] = useState('');
  const [isManuallyEdited, setIsManuallyEdited] = useState(false); // 新增：追蹤使用者是否手動修改過名稱
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [importMode] = useState<ImportMode>('json');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  
  const transcriptFileInputRef = useRef<HTMLInputElement>(null);

  // 當 Modal 關閉時重置所有狀態
  useEffect(() => {
    if (!isOpen) {
      setName('');
      setAudioFile(null);
      setInputValue('');
      setIsManuallyEdited(false);
      setAiStatus(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // ✅ [OPTIMIZED] 智慧填入邏輯：僅在名稱為空或未被手動編輯時覆蓋
  const handleAudioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setAudioFile(file);
      
      // 邏輯：如果專案名稱目前是空的，或者是自動帶入且使用者還沒動過，則更新它
      if (!name.trim() || !isManuallyEdited) {
        const autoName = file.name.replace(/\.[^/.]+$/, "");
        setName(autoName);
        // 注意：這裡不設定 isManuallyEdited 為 true，因為這仍屬於自動行為
      }
    }
  };

  const handleTranscriptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setInputValue(content);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  /**
   * 智慧正規化單個 JSON 物件 (支援深度映射)
   */
  const normalizeItem = (item: any) => {
    // 1. 映射英文內容 (en)
    const english = item.en || item.english || item.text || item.sentence || item.content || "";
    
    // 2. 映射中文內容 (zh)
    const chinese = item.zh || item.chinese || item.translation || item.meaning || item.trans || "";
    
    // 3. 映射時間戳 (startTime)
    const timeStr = String(item.startTime || item.time || item.t || item.start || item.timestamp || "0:00");
    
    // 4. 映射說話者 (speaker)
    const speaker = item.speaker || item.name || item.s || "Speaker";

    // 5. 深度映射單字庫 (highlights)
    const rawHighlights = item.highlights || item.h || item.words || item.vocab || item.vocabulary || [];
    const highlights: Highlight[] = Array.isArray(rawHighlights) 
      ? rawHighlights
        .map((h: any): Highlight => {
          const text = h.text || h.word || h.w || h.keyword || "";
          const ipa = h.ipa || h.p || h.pronunciation || h.phonetic || "";
          const meaning = h.meaning || h.m || h.definition || h.zh || h.chinese || h.mean || h.translation || "";
          const example = h.example || h.x || h.sentence || h.ex || "";
          const type = (h.type === "phrase" ? "phrase" : "word") as 'word' | 'phrase';
          return { text, ipa, meaning, example, type };
        })
        .filter(h => h.text.trim() !== "") 
      : [];

    return { 
      en: english, 
      zh: chinese, 
      time: timeStr, 
      speaker, 
      highlights 
    };
  };

  /**
   * 將原始資料轉換為內部標準 TranscriptLine 格式
   */
  const convertRawDataToLines = (data: any[]): TranscriptLine[] => {
    return data.map((rawItem, index) => {
      const { en, zh, time, speaker, highlights } = normalizeItem(rawItem);
      
      const timeParts = time.split(':');
      let startTimeSeconds = 0;
      if (timeParts.length === 2) {
        startTimeSeconds = parseFloat(timeParts[0]) * 60 + parseFloat(timeParts[1]);
      } else if (timeParts.length === 3) {
        startTimeSeconds = parseFloat(timeParts[0]) * 3600 + parseFloat(timeParts[1]) * 60 + parseFloat(timeParts[2]);
      } else {
        startTimeSeconds = parseFloat(time);
      }
      
      return {
        id: Math.random().toString(36).substr(2, 9) + index,
        startTime: isNaN(startTimeSeconds) ? 0 : startTimeSeconds,
        timestamp: time.includes(':') ? time.split('.')[0] : time, 
        segments: [{
          speaker,
          english: en,
          chinese: zh,
          highlights
        }]
      };
    }).sort((a, b) => a.startTime - b.startTime);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!audioFile) {
      alert("請先選擇音訊檔案");
      return;
    }
    if (!name.trim()) {
      alert("請輸入專案名稱");
      return;
    }

    setIsSubmitting(true);

    try {
      let finalLines: TranscriptLine[] = [];
      let finalTranscriptText = inputValue;

      // 1. 自動分析模式 (輸入框完全沒填)
      if (!inputValue.trim()) {
        setAiStatus("Gemini AI 正在深度分析語音與單字...");
        const aiResult = await generateTranscript(audioFile);
        finalLines = convertRawDataToLines(aiResult);
        finalTranscriptText = aiResult.map((r: any) => `${r.startTime}\n${r.speaker || 'Speaker'}: ${r.en}\n${r.zh}`).join('\n\n');
      } 
      // 2. JSON 模式
      else {
        try {
          let cleanedJson = inputValue.trim();
          cleanedJson = cleanedJson.replace(/\]\s*\[/g, ',');
          if (!cleanedJson.startsWith('[')) cleanedJson = '[' + cleanedJson;
          if (!cleanedJson.endsWith(']')) cleanedJson = cleanedJson + ']';

          const parsed = JSON.parse(cleanedJson);
          const dataArray = Array.isArray(parsed) ? parsed : [parsed];
          
          finalLines = convertRawDataToLines(dataArray);

          if (finalLines.length > 0 && !finalLines[0].segments[0].english) {
            throw new Error("JSON 格式正確但內容缺失必要欄位 (英文內容)。");
          }

          setAiStatus("智慧深度映射成功！");
        } catch (jsonErr: any) {
          throw new Error("JSON 解析失敗，請檢查內容格式：\n" + jsonErr.message);
        }
      }

      const id = Math.random().toString(36).substr(2, 9);
      const audioUrl = URL.createObjectURL(audioFile);
      const newItem: HistoryItem = { 
        id, 
        name: name.trim(), 
        createdAt: Date.now(), 
        audioUrl, 
        transcript: finalTranscriptText, 
        lines: finalLines 
      };

      await saveItem(newItem, audioFile);
      onImportComplete(newItem);
      onClose();
    } catch (err: any) {
      console.error("Import Error:", err);
      alert(err.message || "建立專案時發生未知錯誤");
    } finally {
      setIsSubmitting(false);
      setAiStatus(null);
    }
  };

  const isButtonDisabled = isSubmitting || !audioFile || !name.trim();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-white/20">
        {/* Header */}
        <div className="p-6 border-b flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-xl font-bold text-slate-900">建立英語學習專案</h2>
            <p className="text-xs text-slate-500 mt-0.5">匯入音檔並配對 JSON 逐字稿</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {/* Project Name */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">專案名稱</label>
            <input 
              required 
              type="text" 
              value={name} 
              onChange={e => {
                setName(e.target.value);
                setIsManuallyEdited(true); // 標記為手動編輯
              }} 
              placeholder="例如：TED Talk - The power of vulnerability" 
              className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all font-medium" 
            />
          </div>

          {/* Audio Upload */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">音訊檔案</label>
            <div className="relative group">
              <input 
                required 
                type="file" 
                accept="audio/*" 
                onChange={handleAudioChange} 
                className="absolute inset-0 opacity-0 cursor-pointer z-10" 
              />
              <div className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${audioFile ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 group-hover:border-indigo-200'}`}>
                <div className="flex flex-col items-center">
                  <div className={`p-3 rounded-full mb-3 ${audioFile ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" /></svg>
                  </div>
                  <div className="text-sm font-bold text-slate-700">{audioFile ? audioFile.name : "點擊或拖放音訊檔案"}</div>
                  <div className="text-[10px] text-slate-400 mt-1">支援 MP3, WAV, M4A</div>
                </div>
              </div>
            </div>
          </div>

          {/* Transcript Upload */}
          <div className="space-y-3">
            <div className="flex items-center justify-between ml-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">JSON 逐字稿內容 (選填)</label>
              <div className="flex items-center space-x-2">
                <input 
                  type="file" 
                  ref={transcriptFileInputRef} 
                  onChange={handleTranscriptFileChange} 
                  accept=".json" 
                  className="hidden" 
                />
                <button 
                  type="button"
                  onClick={() => transcriptFileInputRef.current?.click()}
                  className="flex items-center px-3 py-1.5 text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md transition-all"
                >
                  <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  上傳 JSON 檔案
                </button>
              </div>
            </div>

            <div className="relative">
              <textarea 
                value={inputValue} 
                onChange={e => setInputValue(e.target.value)} 
                placeholder="深度智慧映射已啟用：\n系統會自動識別 en/text, zh/mean, words/vocab 等欄位\n留空將自動啟動 Gemini AI 深度分析" 
                className="w-full h-40 px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all font-mono text-xs leading-relaxed resize-none"
              />
              {inputValue.trim() === "" && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
                  <div className="text-center">
                    <p className="text-[10px] font-bold text-indigo-600">留空將自動啟動 AI 分析</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Submit Button */}
          <button 
            type="submit"
            disabled={isButtonDisabled} 
            className="w-full py-4 rounded-2xl font-bold bg-indigo-600 text-white shadow-xl shadow-indigo-200 hover:bg-indigo-700 hover:-translate-y-0.5 transition-all disabled:bg-slate-300 disabled:shadow-none disabled:translate-y-0 flex items-center justify-center space-x-2"
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <span>{aiStatus || "處理中..."}</span>
              </>
            ) : (
              <span>建立並開始學習</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ImportDialog;
