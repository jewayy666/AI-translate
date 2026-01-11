
import React, { useState, useEffect, useCallback, useRef } from 'react';
import AudioPlayer from './components/AudioPlayer';
import TranscriptViewer from './components/TranscriptViewer';
import VocabSidebar from './components/VocabSidebar';
import HistoryList from './components/HistoryList';
import ImportDialog from './components/ImportDialog';
import { HistoryItem, Highlight } from './types';
import { getAllItems, deleteItem as deleteFromDB, saveItem } from './services/storageService';
import { lookupVocabulary } from './services/aiService';
import { formatTime } from './utils';

const App: React.FC = () => {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeItem, setActiveItem] = useState<HistoryItem | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('dark-mode');
    return saved ? JSON.parse(saved) : false;
  });

  const [vocabularyList, setVocabularyList] = useState<Highlight[]>([]);
  const [isLookupLoading, setIsLookupLoading] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const historyRef = useRef<HistoryItem[]>([]);

  useEffect(() => { historyRef.current = history; }, [history]);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('dark-mode', JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  useEffect(() => {
    const savedVocab = localStorage.getItem('my-vocabulary');
    if (savedVocab) {
      try {
        setVocabularyList(JSON.parse(savedVocab));
      } catch (err) {
        console.error("解析 LocalStorage 單字庫失敗", err);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('my-vocabulary', JSON.stringify(vocabularyList));
  }, [vocabularyList]);

  const loadHistory = useCallback(async () => {
    try {
      const items = await getAllItems();
      const itemsWithUrls = items.map(item => ({ ...item, audioUrl: URL.createObjectURL(item.audioBlob) }));
      setHistory(itemsWithUrls);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => {
    loadHistory();
    return () => historyRef.current.forEach(item => item.audioUrl && URL.revokeObjectURL(item.audioUrl));
  }, [loadHistory]);

  const handleSeek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  }, []);

  /**
   * 時間軸批量位移校正
   * @param startIndex 從哪一句開始校正
   * @param timeDelta 位移差值 (秒)
   */
  const handleShiftTimestamps = useCallback(async (startIndex: number, timeDelta: number) => {
    if (!activeItem) return;

    // 1. 計算新的 lines 資料
    const updatedLines = activeItem.lines.map((line, idx) => {
      if (idx >= startIndex) {
        const newStartTime = Math.max(0, line.startTime + timeDelta);
        return {
          ...line,
          startTime: newStartTime,
          timestamp: formatTime(newStartTime)
        };
      }
      return line;
    });

    const updatedItem = { ...activeItem, lines: updatedLines };
    
    // 2. 更新狀態
    setActiveItem(updatedItem);
    setHistory(prev => prev.map(h => h.id === updatedItem.id ? updatedItem : h));

    // 3. 持久化到 IndexedDB (注意：需保留原始 Blob)
    try {
      const originalBlob = (activeItem as any).audioBlob;
      if (originalBlob) {
        await saveItem(updatedItem, originalBlob);
        console.log(`Successfully shifted timestamps from index ${startIndex} by ${timeDelta.toFixed(2)}s`);
      }
    } catch (err) {
      console.error("Failed to save shifted timestamps to DB", err);
    }
  }, [activeItem]);

  const handleTranscriptVocabClick = useCallback((text: string) => {
    const el = document.getElementById(`vocab-${text}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('bg-indigo-100', 'dark:bg-indigo-900/40');
      setTimeout(() => el.classList.remove('bg-indigo-100', 'dark:bg-indigo-900/40'), 1500);
    }
  }, []);

  const handleAddToVocabulary = useCallback(async (text: string, time: number) => {
    if (isLookupLoading) return;
    
    setIsLookupLoading(true);
    try {
      const result = await lookupVocabulary(text);
      const newEntry = { ...result, timestamp: time }; 

      setVocabularyList(prev => {
        if (prev.some(v => v.text.toLowerCase() === newEntry.text.toLowerCase())) return prev;
        return [newEntry, ...prev];
      });

      setTimeout(() => {
        const el = document.getElementById(`vocab-${newEntry.text}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    } catch (err: any) {
      alert(err.message || "查詢失敗，請檢查網路或 API Key 設定。");
    } finally {
      setIsLookupLoading(false);
    }
  }, [isLookupLoading]);

  const handleExportVocab = useCallback(() => {
    const aiKeywords: Highlight[] = [];
    if (activeItem) {
      activeItem.lines.forEach(line => {
        line.segments.forEach(seg => {
          if (seg.highlights) {
            aiKeywords.push(...seg.highlights);
          }
        });
      });
    }

    const formatItem = (item: Highlight) => {
      const word = item.text || "";
      const ipa = item.ipa ? ` (${item.ipa})` : "";
      const meaning = item.meaning || "";
      const example = item.example || "N/A";
      return `${word}${ipa} - ${meaning}\r\nExample: ${example}\r\n---------------------------`;
    };

    let exportContent = "";
    if (vocabularyList.length > 0) {
      exportContent += "新增生詞\r\n---------------------------\r\n";
      exportContent += vocabularyList.map(formatItem).join('\r\n');
      exportContent += "\r\n\r\n";
    }
    if (aiKeywords.length > 0) {
      const userVocabTexts = new Set(vocabularyList.map(v => (v.text || "").toLowerCase().trim()));
      const filteredAiKeywords = aiKeywords.filter(h => !userVocabTexts.has((h.text || "").toLowerCase().trim()));
      if (filteredAiKeywords.length > 0) {
        exportContent += "智慧單字\r\n---------------------------\r\n";
        exportContent += filteredAiKeywords.map(formatItem).join('\r\n');
      }
    }

    if (!exportContent.trim()) {
      alert('目前沒有單字可匯出');
      return;
    }

    const blob = new Blob([exportContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vocabulary_list_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [vocabularyList, activeItem]);

  const handleSidebarVocabClick = useCallback((time: number, text: string) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
    const lineIndex = activeItem?.lines.findIndex(l => l.startTime === time);
    if (lineIndex !== undefined && lineIndex !== -1) {
      const el = document.getElementById(`transcript-segment-${lineIndex}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeItem]);

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 overflow-hidden font-sans transition-colors duration-300">
      {isLookupLoading && (
        <div className="fixed top-4 right-4 z-[2000] bg-indigo-600 text-white px-4 py-2 rounded-full shadow-lg flex items-center space-x-2 animate-bounce">
          <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          <span className="text-xs font-bold">AI 查詢中...</span>
        </div>
      )}

      {/* 頂部功能列：整合播放器與資訊 */}
      <header className="bg-white dark:bg-gray-900 border-b dark:border-gray-800 h-24 flex items-center shrink-0 z-50 shadow-sm transition-colors">
        {activeItem ? (
          <div className="flex w-full items-center px-6">
            <div className="flex-1 flex items-center">
              <AudioPlayer 
                ref={audioRef} 
                url={activeItem.audioUrl} 
                isPlaying={isPlaying} 
                setIsPlaying={setIsPlaying} 
                currentTime={currentTime} 
                onTimeUpdate={setCurrentTime} 
                onDurationChange={setDuration} 
                seekTo={handleSeek}
              />
            </div>
            <div className="w-[30%] border-l dark:border-gray-800 ml-8 pl-8 flex items-center justify-between">
              <div className="truncate">
                <h2 className="text-base font-bold text-gray-800 dark:text-gray-100 truncate">{activeItem.name}</h2>
                <p className="text-[10px] text-indigo-500 font-bold uppercase tracking-widest mt-0.5">English Learning Mode</p>
              </div>
              <div className="flex items-center space-x-3">
                <button 
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  className={`p-2 rounded-lg transition-colors ${isSidebarOpen ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:bg-slate-50'}`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                </button>
                <button onClick={() => setActiveItem(null)} className="text-xs font-bold text-slate-400 hover:text-red-500 transition-colors bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                  返回
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex w-full items-center px-6 justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-indigo-600 p-2.5 rounded-xl text-white shadow-lg">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
              </div>
              <span className="font-black text-2xl tracking-tight">AudioTranscriber <span className="text-indigo-600">Pro</span></span>
            </div>
            <div className="flex items-center space-x-4">
               <button 
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-2.5 rounded-xl bg-slate-50 dark:bg-gray-800 text-slate-400 hover:text-indigo-600 transition-all"
              >
                {isDarkMode ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M16.243 17.657l.707.707M7.757 6.364l.707.707M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>}
              </button>
              <button onClick={() => setIsImportOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-bold shadow-xl shadow-indigo-100 flex items-center transition-all active:scale-95">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                建立新專案
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 flex overflow-hidden">
        {activeItem ? (
          <div className="flex-1 flex overflow-hidden">
            <div className={`flex flex-col h-full overflow-hidden transition-all duration-300 ${isSidebarOpen ? 'flex-1' : 'w-full'}`}>
              <TranscriptViewer 
                lines={activeItem.lines} 
                currentTime={currentTime}
                onSeek={handleSeek} 
                onVocabClick={handleTranscriptVocabClick} 
                onAddToVocab={handleAddToVocabulary}
                onShiftTimestamps={handleShiftTimestamps}
              />
            </div>

            {/* 側邊單字庫 */}
            <div className={`h-full border-l dark:border-gray-800 bg-white dark:bg-gray-900 transition-all duration-300 ${isSidebarOpen ? 'w-[320px] md:w-[380px] opacity-100' : 'w-0 opacity-0 pointer-events-none'}`}>
              <VocabSidebar 
                lines={activeItem.lines} 
                userVocab={vocabularyList}
                onVocabClick={handleSidebarVocabClick} 
                onExport={handleExportVocab}
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-12 bg-slate-50 dark:bg-gray-950 transition-colors duration-300">
            <div className="max-w-7xl mx-auto">
              <div className="flex items-baseline space-x-4 mb-10">
                <h1 className="text-4xl font-black text-slate-900 dark:text-gray-100">學習歷史</h1>
                <span className="text-slate-400 font-bold uppercase tracking-tighter text-sm">Review Your Progress</span>
              </div>
              <HistoryList items={history} onSelectItem={(it) => setActiveItem(it)} onDeleteItem={(id) => deleteFromDB(id).then(loadHistory)} />
            </div>
          </div>
        )}
      </main>
      <ImportDialog isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} onImportComplete={loadHistory} />
    </div>
  );
};

export default App;
