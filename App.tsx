
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  Upload, FileAudio, Loader2, Sparkles, Languages, BookOpen, 
  CheckCircle2, FileText, Bookmark, X, Trash2, ExternalLink, 
  MousePointer2, Play, Pause, RotateCcw, RotateCw, Settings2,
  ChevronLeft, ChevronRight, Timer, Music
} from 'lucide-react';
import { GeminiService, parseTimeToSeconds } from './services/geminiService';
import { TranscriptionResult, ProcessingStatus, SavedWord } from './types';
import TranscriptCard from './components/TranscriptCard';
import VocabularyCard from './components/VocabularyCard';

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<ProcessingStatus>({ step: 'idle', message: '', progress: 0 });
  const [result, setResult] = useState<TranscriptionResult | null>(null);
  const [savedWords, setSavedWords] = useState<SavedWord[]>([]);
  const [isBankOpen, setIsBankOpen] = useState(false);
  const [timestampOffset, setTimestampOffset] = useState<number>(0);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, text: string, type: 'transcript' | 'vocabulary', index: number } | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      // IMPORTANT: Decoupled Playback Strategy
      // We load the ORIGINAL unprocessed file into the browser's audio tag.
      // This ensures 100% audio fidelity and zero gaps.
      setAudioUrl(URL.createObjectURL(selectedFile));
      setResult(null);
      setIsPlaying(false);
      setCurrentTime(0);
      setTimestampOffset(0);
      setStatus({ step: 'idle', message: '', progress: 0 });
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    isPlaying ? audioRef.current.pause() : audioRef.current.play();
    setIsPlaying(!isPlaying);
  };

  const seek = (seconds: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, Math.min(seconds, duration));
    setCurrentTime(audioRef.current.currentTime);
    if (!isPlaying) {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const skip = (seconds: number) => {
    if (!audioRef.current) return;
    const target = audioRef.current.currentTime + seconds;
    audioRef.current.currentTime = Math.max(0, Math.min(target, duration));
    setCurrentTime(audioRef.current.currentTime);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) setDuration(audioRef.current.duration);
  };

  const adjustOffset = (delta: number) => {
    setTimestampOffset(prev => prev + delta);
  };

  const scrollToElement = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('ring-4', 'ring-blue-500/50', 'transition-all', 'duration-500');
      setTimeout(() => element.classList.remove('ring-4', 'ring-blue-500/50'), 2000);
    }
  };

  const handleJumpToVocab = (word: string) => {
    if (!result) return;
    const vocabIdx = result.vocabulary.findIndex(v => v.word.toLowerCase() === word.toLowerCase());
    if (vocabIdx !== -1) scrollToElement(`vocab-${vocabIdx}`);
  };

  const handleJumpToTranscript = (word: string) => {
    if (!result) return;
    const transcriptIdx = result.transcript.findIndex(t => 
      new RegExp(`\\b${word}\\b`, 'i').test(t.english)
    );
    if (transcriptIdx !== -1) scrollToElement(`transcript-${transcriptIdx}`);
  };

  const processTranscription = async () => {
    if (!file) return;
    const service = new GeminiService();
    setStatus({ step: 'uploading', message: '正在初始化全語法分析引擎...', progress: 2 });
    try {
      const finalResult = await service.processAudio(file, (msg, prog) => {
        setStatus(prev => ({ ...prev, message: msg, progress: prog, step: 'transcribing' }));
      });
      setResult(finalResult);
      setStatus({ step: 'completed', message: '分析完成！', progress: 100 });
    } catch (error) {
      console.error(error);
      setStatus({ step: 'error', message: '分析失敗。音檔可能過大或格式不支援。', progress: 0 });
    }
  };

  const handleRightClick = (e: React.MouseEvent, text: string, index: number, type: 'transcript' | 'vocabulary') => {
    setContextMenu({ x: e.clientX, y: e.clientY, text, type, index });
  };

  const removeSavedWord = (id: string) => {
    setSavedWords(prev => prev.filter(sw => sw.id !== id));
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 relative selection:bg-blue-500/30 font-sans">
      {audioUrl && (
        <audio 
          ref={audioRef} 
          src={audioUrl} 
          onTimeUpdate={handleTimeUpdate} 
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div 
          className="fixed z-[100] bg-white border border-slate-200 shadow-2xl rounded-xl py-2 w-64 animate-in fade-in zoom-in-95 duration-100"
          style={{ top: contextMenu.y + 2, left: Math.min(contextMenu.x + 2, window.innerWidth - 270) }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 py-2 border-b border-slate-100 mb-1">
            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">標記收藏</p>
            <p className="text-sm font-bold text-slate-700 truncate mt-1">"{contextMenu.text}"</p>
          </div>
          <button 
            onClick={(e) => {
              e.stopPropagation();
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
            }}
            className="w-full text-left px-4 py-3 text-sm text-slate-600 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-3 transition-colors"
          >
            <Bookmark className="w-4 h-4" />
            <span className="font-semibold">加入我的生詞庫</span>
          </button>
        </div>
      )}

      <header className="bg-white/95 backdrop-blur-2xl border-b border-slate-200 sticky top-0 z-40 shadow-sm h-16 transition-all duration-300">
        <div className="max-w-[1500px] mx-auto px-4 h-full flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-900/10">
              <Music className="text-white w-4 h-4" />
            </div>
            <h1 className="text-sm font-black text-slate-900 tracking-widest uppercase hidden lg:block">Original Audio Player</h1>
          </div>

          {audioUrl && (
            <div className="flex-1 max-w-3xl flex items-center gap-4 bg-slate-50 rounded-2xl px-5 py-2 border border-slate-200">
              <div className="flex items-center gap-1.5">
                <button onClick={() => skip(-15)} className="text-slate-400 hover:text-slate-900 p-1.5 transition-colors" title="倒轉 15s">
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button onClick={togglePlay} className="w-9 h-9 bg-blue-600 text-white rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-md">
                  {isPlaying ? <Pause className="w-4 h-4" fill="currentColor" /> : <Play className="w-4 h-4 ml-0.5" fill="currentColor" />}
                </button>
                <button onClick={() => skip(15)} className="text-slate-400 hover:text-slate-900 p-1.5 transition-colors" title="快轉 15s">
                  <RotateCw className="w-4 h-4" />
                </button>
              </div>
              
              <div className="flex-1 flex flex-col gap-0.5">
                <div className="flex justify-between items-center text-[10px] font-bold font-mono text-slate-500 tracking-tighter">
                  <span className="truncate max-w-[200px] opacity-60">{file?.name}</span>
                  <div className="flex items-center gap-1.5 bg-white px-2 py-0.5 rounded border border-slate-100 text-blue-600 shadow-sm">
                    <span className="font-black">SOURCE: {formatSeconds(currentTime)}</span>
                    <span className="opacity-20">/</span>
                    <span className="opacity-60">{formatSeconds(duration)}</span>
                  </div>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max={duration || 0} 
                  step="0.1"
                  value={currentTime}
                  onChange={(e) => seek(parseFloat(e.target.value))}
                  className="w-full h-1 bg-slate-200 rounded-full appearance-none cursor-pointer accent-blue-600 hover:accent-blue-500 transition-all"
                />
              </div>
            </div>
          )}
          
          <div className="flex items-center gap-3 flex-shrink-0">
            {file && status.step === 'idle' && (
              <button 
                onClick={processTranscription}
                className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-lg shadow-blue-900/10 active:scale-95"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>分析音檔</span>
              </button>
            )}
            <button onClick={() => setIsBankOpen(true)} className="relative p-2.5 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded-xl transition-all group">
              <Bookmark className="w-5 h-5 group-hover:scale-110 transition-transform" />
              {savedWords.length > 0 && (
                <span className="absolute top-1 right-1 bg-blue-600 text-white text-[9px] font-black w-4 h-4 flex items-center justify-center rounded-full border-2 border-white">
                  {savedWords.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12 pb-24">
        {!result && status.step !== 'transcribing' && (
          <div className="max-w-xl mx-auto bg-slate-50 rounded-[3rem] border-2 border-dashed border-slate-200 p-16 text-center mt-12 shadow-sm">
            <div className="w-20 h-20 bg-blue-500/10 rounded-3xl flex items-center justify-center mx-auto mb-8">
              <Upload className="w-10 h-10 text-blue-600" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-3">無損音訊逐字稿對位</h2>
            <p className="text-slate-500 mb-10 text-sm leading-relaxed max-w-xs mx-auto font-medium">播放原始檔案以確保 100% 音質，AI 同步完成分析與對位。</p>
            <input type="file" accept="audio/*" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
            <button onClick={() => fileInputRef.current?.click()} className="bg-blue-600 text-white px-10 py-4 rounded-2xl font-black hover:bg-blue-700 transition-all mx-auto block shadow-xl active:scale-95">
              {file ? '更換原始音檔' : '上傳原始音檔'}
            </button>
          </div>
        )}

        {status.step !== 'idle' && status.step !== 'completed' && status.step !== 'error' && (
          <div className="max-w-md mx-auto bg-white rounded-[2.5rem] p-12 shadow-2xl border border-slate-100 text-center mt-12">
            <Loader2 className="w-16 h-16 text-blue-600 animate-spin mx-auto mb-8 opacity-70" />
            <h3 className="text-xl font-black text-slate-900 mb-6 tracking-tight">{status.message}</h3>
            <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden mb-3">
              <div className="bg-blue-600 h-full transition-all duration-1000" style={{ width: `${status.progress}%` }} />
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">{status.progress}% COMPLETE</span>
          </div>
        )}

        {result && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            <div className="lg:col-span-8">
              <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-3">
                  <div className="w-1 h-8 bg-blue-600 rounded-full" />
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">同步逐字稿</h2>
                </div>
                
                <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="px-3 flex items-center gap-2 text-slate-400">
                    <Timer className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-black uppercase tracking-wider">時間校正</span>
                  </div>
                  <button onClick={() => adjustOffset(-1)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-[11px] font-bold text-slate-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 transition-all active:scale-95">
                    <ChevronLeft className="w-3 h-3" />
                    -1s
                  </button>
                  <div className="px-2 min-w-[40px] text-center">
                    <span className={`text-xs font-mono font-bold ${timestampOffset === 0 ? 'text-slate-300' : 'text-blue-600'}`}>
                      {timestampOffset > 0 ? `+${timestampOffset}` : timestampOffset}s
                    </span>
                  </div>
                  <button onClick={() => adjustOffset(1)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-[11px] font-bold text-slate-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 transition-all active:scale-95">
                    +1s
                    <ChevronRight className="w-3 h-3" />
                  </button>
                  <button onClick={() => setTimestampOffset(0)} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors" title="重設校正">
                    <RotateCcw className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="space-y-4 pb-48">
                {result.transcript.map((line, idx) => (
                  <TranscriptCard 
                    key={idx} 
                    line={line} 
                    index={idx} 
                    vocabulary={result.vocabulary}
                    timestampOffset={timestampOffset}
                    onVocabJump={handleJumpToVocab}
                    onSeek={seek}
                    onRightClick={(e, text, i) => handleRightClick(e, text, i, 'transcript')} 
                  />
                ))}
              </div>
            </div>

            <div className="lg:col-span-4 lg:sticky lg:top-28 h-fit">
              <div className="flex items-center gap-3 mb-10">
                <div className="w-1 h-8 bg-emerald-500 rounded-full" />
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">核心生字</h2>
              </div>
              <div className="space-y-5 lg:max-h-[calc(100vh-200px)] overflow-y-auto pr-3 custom-scrollbar">
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

      <div className={`fixed inset-y-0 right-0 w-80 sm:w-96 bg-white border-l border-slate-200 shadow-2xl z-[60] transform transition-transform duration-700 cubic-bezier(0.23, 1, 0.32, 1) ${isBankOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="h-full flex flex-col p-10">
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3"><Bookmark className="w-6 h-6 text-blue-600" />生詞庫</h2>
            <button onClick={() => setIsBankOpen(false)} className="p-3 hover:bg-slate-50 rounded-2xl text-slate-400 hover:text-slate-900 transition-all"><X className="w-6 h-6" /></button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
            {savedWords.length === 0 ? (
              <div className="text-center opacity-20 mt-32">
                <MousePointer2 className="w-16 h-16 mx-auto mb-6 text-slate-300" />
                <p className="text-lg font-black tracking-widest uppercase text-slate-400">Empty Bank</p>
                <p className="text-xs mt-2 font-bold text-slate-400">點擊右鍵標記內容</p>
              </div>
            ) : (
              <div className="space-y-5">
                {savedWords.map(sw => (
                  <div key={sw.id} className="p-6 rounded-2xl bg-slate-50 border border-slate-200 group transition-all hover:border-blue-500/50 hover:bg-white">
                    <div className="flex justify-between items-start mb-4">
                      <h4 className="font-bold text-slate-900 text-lg leading-tight break-words flex-1 pr-4">{sw.word}</h4>
                      <button onClick={() => removeSavedWord(sw.id)} className="text-slate-400 hover:text-red-500 p-1 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <button 
                      onClick={() => scrollToElement(sw.sourceType === 'transcript' ? `transcript-${sw.index}` : `vocab-${sw.index}`)} 
                      className="text-[10px] font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg flex items-center gap-2 hover:bg-blue-600 hover:text-white transition-all border border-blue-100"
                    >
                      <ExternalLink className="w-3 h-3" />定位來源
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {isBankOpen && <div className="fixed inset-0 bg-slate-900/10 backdrop-blur-sm z-50 transition-all duration-700" onClick={() => setIsBankOpen(false)} />}
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
        
        input[type='range'] {
          -webkit-appearance: none;
          background: transparent;
        }
        input[type='range']::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 14px;
          width: 14px;
          border-radius: 50%;
          background: #2563eb;
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          margin-top: -5px;
        }
        input[type='range']::-webkit-slider-runnable-track {
          width: 100%;
          height: 4px;
          background: #f1f5f9;
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
};

export default App;
