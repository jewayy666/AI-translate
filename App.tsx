
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  Upload, FileAudio, Loader2, Sparkles, Languages, BookOpen, 
  CheckCircle2, AlertCircle, FileText, Bookmark, X, Trash2, ExternalLink, MousePointer2 
} from 'lucide-react';
import { GeminiService } from './services/geminiService';
import { TranscriptionResult, ProcessingStatus, SavedWord } from './types';
import TranscriptCard from './components/TranscriptCard';
import VocabularyCard from './components/VocabularyCard';

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ProcessingStatus>({ step: 'idle', message: '', progress: 0 });
  const [result, setResult] = useState<TranscriptionResult | null>(null);
  const [savedWords, setSavedWords] = useState<SavedWord[]>([]);
  const [isBankOpen, setIsBankOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, text: string, type: 'transcript' | 'vocabulary', index: number } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const vocabularyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
      setStatus({ step: 'idle', message: '', progress: 0 });
    }
  };

  const scrollToSection = (ref: React.RefObject<HTMLDivElement>) => {
    if (ref.current) {
      const offset = 140;
      const elementPosition = ref.current.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;
      window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
    }
  };

  const scrollToElement = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const offset = 160;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;
      window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
      
      element.classList.add('ring-4', 'ring-blue-500/50', 'transition-all', 'duration-500');
      setTimeout(() => {
        element.classList.remove('ring-4', 'ring-blue-500/50');
      }, 2000);
      
      if (window.innerWidth < 1024) setIsBankOpen(false);
    }
  };

  const handleJumpToVocab = (word: string) => {
    if (!result) return;
    const vocabIdx = result.vocabulary.findIndex(v => v.word.toLowerCase() === word.toLowerCase());
    if (vocabIdx !== -1) {
      scrollToElement(`vocab-${vocabIdx}`);
    }
  };

  const handleJumpToTranscript = (word: string) => {
    if (!result) return;
    const transcriptIdx = result.transcript.findIndex(t => 
      new RegExp(`\\b${word}\\b`, 'i').test(t.english)
    );
    if (transcriptIdx !== -1) {
      scrollToElement(`transcript-${transcriptIdx}`);
    }
  };

  const processTranscription = async () => {
    if (!file) return;
    const service = new GeminiService();
    setStatus({ step: 'uploading', message: '準備上傳中...', progress: 5 });
    try {
      const finalResult = await service.processAudio(file, (msg, prog) => {
        setStatus(prev => ({ ...prev, message: msg, progress: prog, step: 'transcribing' }));
      });
      setResult(finalResult);
      setStatus({ step: 'completed', message: '處理完成！', progress: 100 });
    } catch (error) {
      console.error(error);
      setStatus({ step: 'error', message: '處理失敗，請稍後再試。', progress: 0 });
    }
  };

  const handleRightClick = (e: React.MouseEvent, text: string, index: number, type: 'transcript' | 'vocabulary') => {
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      text: text.slice(0, 100),
      type,
      index
    });
  };

  const saveToBank = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!contextMenu) return;
    
    const newWord: SavedWord = {
      id: Math.random().toString(36).substr(2, 9),
      word: contextMenu.text,
      sourceText: contextMenu.text,
      sourceType: contextMenu.type,
      index: contextMenu.index,
      timestamp: Date.now()
    };
    
    setSavedWords(prev => [newWord, ...prev]);
    setContextMenu(null);
    setIsBankOpen(true);
  };

  const removeSavedWord = (id: string) => {
    setSavedWords(prev => prev.filter(w => w.id !== id));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20 relative">
      {/* Context Menu */}
      {contextMenu && (
        <div 
          className="fixed z-[100] bg-slate-800 border border-slate-700 shadow-2xl rounded-xl py-2 w-64 animate-in fade-in zoom-in-95 duration-100 ring-1 ring-white/10"
          style={{ 
            top: contextMenu.y + 2, 
            left: Math.min(contextMenu.x + 2, window.innerWidth - 270) 
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 py-2 border-b border-slate-700 mb-1">
            <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">儲存所選內容</p>
            <p className="text-sm font-bold text-slate-200 truncate mt-1">"{contextMenu.text}"</p>
          </div>
          <button 
            onClick={saveToBank}
            className="w-full text-left px-4 py-3 text-sm text-slate-300 hover:bg-blue-600 hover:text-white flex items-center gap-3 transition-colors group"
          >
            <Bookmark className="w-4 h-4 text-blue-400 group-hover:text-white" />
            <span className="font-semibold">加入我的生詞庫</span>
          </button>
        </div>
      )}

      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40 shadow-xl">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-900/20">
              <Languages className="text-white w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">AI 逐字稿助手</h1>
          </div>
          
          <div className="flex items-center gap-3">
            {file && status.step === 'idle' && (
              <button 
                onClick={processTranscription}
                className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-full font-bold transition-all shadow-lg shadow-blue-900/40 flex items-center gap-2 active:scale-95"
              >
                <Sparkles className="w-4 h-4" />
                <span className="hidden sm:inline">開始分析</span>
              </button>
            )}
            
            <button 
              onClick={() => setIsBankOpen(true)}
              className="relative p-2.5 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded-full transition-all group"
              title="我的生詞庫"
            >
              <Bookmark className="w-6 h-6 group-hover:scale-110 transition-transform" />
              <span className="text-sm font-bold hidden md:inline ml-1">我的生詞庫</span>
              {savedWords.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-black min-w-[20px] h-5 px-1 flex items-center justify-center rounded-full border-2 border-slate-900 animate-in zoom-in">
                  {savedWords.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Secondary Navigation */}
      {result && (
        <div className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 sticky top-16 z-30 transition-all duration-300">
          <div className="max-w-6xl mx-auto px-4 py-3 flex gap-4 overflow-x-auto no-scrollbar">
            <button 
              onClick={() => scrollToSection(transcriptRef)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-slate-800 text-slate-200 font-bold text-sm whitespace-nowrap hover:bg-slate-700 transition-colors border border-slate-700"
            >
              <FileText className="w-4 h-4 text-blue-400" />
              查看逐字稿
            </button>
            <button 
              onClick={() => scrollToSection(vocabularyRef)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-slate-800 text-slate-200 font-bold text-sm whitespace-nowrap hover:bg-slate-700 transition-colors border border-slate-700"
            >
              <BookOpen className="w-4 h-4 text-emerald-400" />
              重點單字分析
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {!result && status.step !== 'transcribing' && (
          <div className="max-w-2xl mx-auto bg-slate-900 rounded-[2.5rem] border-2 border-dashed border-slate-800 p-16 text-center shadow-2xl mt-10">
            <div className="mb-8 inline-block p-6 bg-blue-500/10 rounded-3xl">
              <Upload className="w-12 h-12 text-blue-500" />
            </div>
            <h2 className="text-2xl font-bold text-slate-100 mb-3">上傳您的音檔</h2>
            <p className="text-slate-500 mb-10 max-w-sm mx-auto leading-relaxed">
              自動進行語音識別、翻譯與單字提取。在內容上<span className="text-blue-400 font-bold">反白單字並按右鍵</span>可快速儲存。
            </p>
            <input type="file" accept="audio/*" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
            <div className="flex flex-col items-center gap-5">
              <button onClick={() => fileInputRef.current?.click()} className="bg-white text-slate-950 px-10 py-4 rounded-2xl font-bold hover:bg-slate-200 transition-all flex items-center gap-3 w-full sm:w-auto justify-center shadow-lg active:scale-95">
                {file ? '重新選擇音檔' : '選擇檔案'}
              </button>
              {file && (
                <div className="flex items-center gap-3 text-slate-300 font-medium bg-slate-800/50 px-5 py-3 rounded-xl border border-slate-700">
                  <FileAudio className="w-5 h-5 text-blue-400" />
                  <span className="truncate max-w-[200px]">{file.name}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {status.step !== 'idle' && status.step !== 'completed' && status.step !== 'error' && (
          <div className="max-w-xl mx-auto bg-slate-900 rounded-[2.5rem] p-12 shadow-2xl border border-slate-800 text-center mt-10">
            <Loader2 className="w-16 h-16 text-blue-500 animate-spin mx-auto mb-8 opacity-60" />
            <h3 className="text-xl font-bold text-slate-100 mb-6">{status.message}</h3>
            <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden mb-3">
              <div className="bg-blue-500 h-full transition-all duration-700 shadow-[0_0_15px_rgba(59,130,246,0.5)]" style={{ width: `${status.progress}%` }} />
            </div>
            <p className="text-sm text-slate-500 font-bold tracking-widest">{status.progress}%</p>
          </div>
        )}

        {result && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-8" ref={transcriptRef}>
              <div className="flex items-center gap-3 mb-8">
                <CheckCircle2 className="text-emerald-500 w-7 h-7" />
                <h2 className="text-2xl font-bold text-white">會議/對話逐字稿</h2>
              </div>
              <div className="space-y-6">
                {result.transcript.map((line, idx) => (
                  <TranscriptCard 
                    key={idx} 
                    line={line} 
                    index={idx} 
                    vocabulary={result.vocabulary}
                    onVocabJump={handleJumpToVocab}
                    onRightClick={(e, text, i) => handleRightClick(e, text, i, 'transcript')} 
                  />
                ))}
              </div>
            </div>

            <div className="lg:col-span-4 lg:sticky lg:top-40 h-fit" ref={vocabularyRef}>
              <div className="flex items-center gap-3 mb-8">
                <BookOpen className="text-blue-500 w-7 h-7" />
                <h2 className="text-2xl font-bold text-white">重點單字分析</h2>
              </div>
              <div className="space-y-5 lg:max-h-[calc(100vh-320px)] overflow-y-auto pr-3 custom-scrollbar">
                {result.vocabulary.map((item, idx) => (
                  <VocabularyCard 
                    key={idx} 
                    item={item} 
                    index={idx}
                    onWordJump={handleJumpToTranscript}
                    onRightClick={(e, text, i) => handleRightClick(e, text, i, 'vocabulary')}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Vocabulary Bank Drawer */}
      <div className={`fixed inset-y-0 right-0 w-80 sm:w-96 bg-slate-900 border-l border-slate-800 shadow-[0_0_50px_rgba(0,0,0,0.5)] z-[60] transform transition-transform duration-500 cubic-bezier(0.4, 0, 0.2, 1) ${isBankOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="h-full flex flex-col">
          <div className="p-8 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
            <div className="flex items-center gap-3">
              <Bookmark className="w-6 h-6 text-blue-500" />
              <h2 className="text-xl font-bold text-white">我的生詞庫</h2>
            </div>
            <button onClick={() => setIsBankOpen(false)} className="p-2.5 hover:bg-slate-800 rounded-xl text-slate-500 hover:text-white transition-all">
              <X className="w-6 h-6" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-900">
            {savedWords.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-30 p-10">
                <MousePointer2 className="w-16 h-16 mb-6" />
                <p className="text-slate-400 font-bold text-lg">尚無收藏生詞</p>
                <p className="text-sm mt-3 leading-relaxed">在內容上<span className="text-blue-400">按右鍵</span><br/>即可快速收錄您的第一個單字</p>
              </div>
            ) : (
              <div className="space-y-4">
                {savedWords.map(sw => (
                  <div key={sw.id} className="p-5 rounded-2xl border border-slate-800 bg-slate-800/40 hover:border-blue-500/50 transition-all group">
                    <div className="flex justify-between items-start mb-3">
                      <h4 className="font-bold text-slate-100 break-words flex-1 pr-3 text-lg leading-tight">{sw.word}</h4>
                      <button onClick={() => removeSavedWord(sw.id)} className="text-slate-600 hover:text-red-500 p-1.5 opacity-0 group-hover:opacity-100 transition-all bg-slate-900 rounded-lg">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-3 mt-4">
                      <button 
                        onClick={() => scrollToElement(sw.sourceType === 'transcript' ? `transcript-${sw.index}` : `vocab-${sw.index}`)}
                        className="text-xs font-bold text-blue-400 bg-blue-500/10 px-3 py-1.5 rounded-lg hover:bg-blue-500 hover:text-white flex items-center gap-2 transition-all"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        跳至出處
                      </button>
                      <span className="text-[10px] text-slate-500 font-medium tracking-wider uppercase">
                        {sw.sourceType === 'transcript' ? '來自逐字稿' : '來自單字表'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="p-6 border-t border-slate-800 bg-slate-900/50">
             <p className="text-[11px] text-center text-slate-500 font-medium uppercase tracking-widest leading-relaxed">點擊「跳至出處」可快速定位上下文</p>
          </div>
        </div>
      </div>
      
      {isBankOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 transition-opacity" onClick={() => setIsBankOpen(false)} />
      )}

      <footer className="fixed bottom-0 left-0 right-0 bg-slate-900/60 backdrop-blur-xl border-t border-slate-800 py-3 px-4 text-center text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] z-40 shadow-2xl">
        Powered by Gemini 3 Pro • Audio Diarization Active
      </footer>

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #475569; }
        
        /* Smooth Scrolling */
        html { scroll-behavior: smooth; }
      `}</style>
    </div>
  );
};

export default App;
