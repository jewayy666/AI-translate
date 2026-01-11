
import React, { useRef, memo, useState, useEffect, useCallback, useMemo } from 'react';
import { TranscriptLine, Highlight } from '../types';
import ContextMenu from './ContextMenu';

interface TranscriptViewerProps {
  lines: TranscriptLine[];
  currentTime: number;
  onSeek: (time: number) => void;
  onVocabClick: (text: string) => void;
  onAddToVocab: (text: string, time: number) => void;
  onShiftTimestamps?: (startIndex: number, timeDelta: number) => void;
}

const renderHighlightedText = (text: string, highlights: Highlight[], onVocabClick: (text: string) => void) => {
  if (!highlights || highlights.length === 0) return text;
  const sortedHighlights = [...highlights].sort((a, b) => b.text.length - a.text.length);
  const pattern = new RegExp(`(${sortedHighlights.map(h => h.text.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|')})`, 'gi');
  const parts = text.split(pattern);

  return parts.map((part, i) => {
    const isMatch = sortedHighlights.find(h => h.text.toLowerCase() === part.toLowerCase());
    if (isMatch) {
      return (
        <span 
          key={i} 
          onClick={(e) => {
            e.stopPropagation();
            onVocabClick(isMatch.text);
          }}
          className="text-red-600 font-medium border-b-2 border-transparent hover:border-red-600 transition-all cursor-pointer mx-0.5 select-text"
          style={{ userSelect: 'text' }}
          title={`${isMatch.ipa} - ${isMatch.meaning}`}
        >
          {part}
        </span>
      );
    }
    return part;
  });
};

const TranscriptRow = memo(({ block, onSeek, onVocabClick, isFocused, index, onClick }: { 
  block: TranscriptLine, 
  onSeek: (time: number) => void, 
  onVocabClick: (text: string) => void,
  isFocused: boolean,
  index: number,
  onClick: () => void
}) => {
  const rowRef = useRef<HTMLElement>(null);

  return (
    <article 
      ref={rowRef}
      id={`transcript-segment-${index}`}
      data-time={block.startTime}
      data-index={index}
      onClick={onClick}
      className={`immersive-translate-target-wrapper flex items-stretch transition-all border-l-4 cursor-pointer ${
        isFocused ? 'border-indigo-600 bg-indigo-50/60 shadow-inner' : 'border-transparent hover:bg-slate-50/50'
      }`}
    >
      {/* 左側時間戳 */}
      <aside 
        onClick={(e) => { e.stopPropagation(); onSeek(block.startTime); }}
        className={`w-16 shrink-0 flex items-start justify-center py-6 font-mono text-xs transition-all group/time ${isFocused ? 'text-indigo-600 font-bold' : 'text-gray-400 hover:text-indigo-600'}`}
      >
        <span className="group-hover/time:underline">{block.timestamp}</span>
      </aside>

      {/* 內容區塊 */}
      <div className={`flex-1 flex flex-col border-l ${isFocused ? 'border-indigo-200' : 'border-gray-100'}`}>
        {block.segments.map((seg, sIdx) => (
          <div key={sIdx} className="flex flex-col border-b border-gray-50 last:border-b-0">
            <div className="px-6 py-6 flex flex-col space-y-3">
              <div className="flex">
                <span 
                  className={`text-[10px] font-black uppercase w-fit px-1.5 py-0.5 rounded transition-colors ${isFocused ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-500'}`}
                >
                  {seg.speaker}
                </span>
              </div>
              <p 
                lang="en"
                className={`immersive-translate-target transcript-en-text text-xl md:text-[20px] leading-relaxed font-normal whitespace-pre-wrap select-text cursor-text ${isFocused ? 'text-slate-900' : 'text-slate-800'}`}
              >
                {renderHighlightedText(seg.english, seg.highlights, onVocabClick)}
              </p>
              <p 
                lang="zh-TW"
                className="immersive-translate-target transcript-zh-text text-base md:text-[16px] leading-relaxed text-slate-500 italic border-l-2 border-slate-100 pl-4 whitespace-pre-wrap select-text cursor-text"
              >
                {seg.chinese}
              </p>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}, (prev, next) => {
  return prev.block.id === next.block.id && 
         prev.isFocused === next.isFocused && 
         prev.block.segments === next.block.segments;
});

const TranscriptViewer: React.FC<TranscriptViewerProps> = memo(({ lines, currentTime, onSeek, onVocabClick, onAddToVocab, onShiftTimestamps }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [readingIndex, setReadingIndex] = useState(0); 
  const [menuPos, setMenuPos] = useState<{ x: number, y: number } | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const [selectedTime, setSelectedTime] = useState(0);
  
  // 新增：校正模式狀態
  const [isCorrectionMode, setIsCorrectionMode] = useState(false);

  // 計算目前選中行與音訊時間的落差
  const currentLag = useMemo(() => {
    if (readingIndex < 0 || readingIndex >= lines.length) return 0;
    return currentTime - lines[readingIndex].startTime;
  }, [currentTime, readingIndex, lines]);

  const scrollToIndex = useCallback((index: number) => {
    const el = document.getElementById(`transcript-segment-${index}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  const handleFocusSegment = useCallback((index: number) => {
    setReadingIndex(index);
    scrollToIndex(index);
  }, [scrollToIndex]);

  const handlePrev = useCallback(() => {
    setReadingIndex(prev => {
      const nextIndex = Math.max(0, prev - 1);
      scrollToIndex(nextIndex);
      return nextIndex;
    });
  }, [scrollToIndex]);

  const handleNext = useCallback(() => {
    setReadingIndex(prev => {
      const nextIndex = Math.min(lines.length - 1, prev + 1);
      scrollToIndex(nextIndex);
      return nextIndex;
    });
  }, [lines.length, scrollToIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

      if (e.code === 'ArrowUp') {
        e.preventDefault();
        handlePrev();
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        handleNext();
      } else if (e.code === 'Enter' && isCorrectionMode) {
        // 校正模式下按 Enter 直接執行校正
        e.preventDefault();
        if (onShiftTimestamps) onShiftTimestamps(readingIndex, currentLag);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrev, handleNext, isCorrectionMode, currentLag, readingIndex, onShiftTimestamps]);

  const handleContextMenu = (e: React.MouseEvent) => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    
    if (text && text.length > 0) {
      e.preventDefault();
      const row = (e.target as HTMLElement).closest('[data-time]');
      const timeAttr = row?.getAttribute('data-time');
      const time = timeAttr ? parseFloat(timeAttr) : 0;

      setSelectedText(text);
      setSelectedTime(time);
      setMenuPos({ x: e.clientX, y: e.clientY });
    } else {
      setMenuPos(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white relative" onContextMenu={handleContextMenu}>
      {/* 懸浮導覽按鈕 */}
      <div className="absolute top-12 left-1/2 -translate-x-1/2 z-[40] flex items-center space-x-1 bg-white/95 backdrop-blur-md border border-slate-200 shadow-xl rounded-full px-3 py-1.5 select-none border-b-2 border-b-indigo-100">
        <button 
          onClick={(e) => { e.stopPropagation(); handlePrev(); }}
          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all flex items-center space-x-1"
          title="上一句 (Up Arrow)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" /></svg>
          <span className="text-[10px] font-bold">Prev</span>
        </button>
        
        <div className="w-px h-4 bg-slate-200 mx-1" />
        
        <button 
          onClick={(e) => { e.stopPropagation(); handleNext(); }}
          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all flex items-center space-x-1"
          title="下一句 (Down Arrow)"
        >
          <span className="text-[10px] font-bold">Next</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
        </button>

        <div className="w-px h-4 bg-slate-200 mx-1" />

        {/* 校正模式開關 */}
        <button 
          onClick={() => setIsCorrectionMode(!isCorrectionMode)}
          className={`p-1.5 rounded-full transition-all flex items-center space-x-1 ${isCorrectionMode ? 'bg-amber-500 text-white shadow-inner' : 'text-slate-400 hover:text-amber-500 hover:bg-amber-50'}`}
          title="校正模式：校正逐字稿與音訊的時間落差"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span className="text-[10px] font-bold">Sync</span>
        </button>

        {/* 批量位移按鈕：僅在模式開啟時顯示 */}
        {isCorrectionMode && (
          <>
            <div className="w-px h-4 bg-slate-200 mx-1" />
            <button 
              onClick={() => onShiftTimestamps && onShiftTimestamps(readingIndex, currentLag)}
              className="px-3 py-1 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition-all shadow-md active:scale-95 flex items-center space-x-1 group"
            >
              <span className="text-[10px] font-bold">⚡ 校正後續</span>
              <span className="text-[10px] opacity-70 font-mono">
                ({currentLag > 0 ? '+' : ''}{currentLag.toFixed(2)}s)
              </span>
            </button>
          </>
        )}
      </div>

      <header className="border-b bg-slate-50 flex items-center px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest sticky top-0 z-10 shrink-0 shadow-sm transition-colors">
        <div className="w-16 shrink-0 text-center">Time</div>
        <div className="flex-1 px-4 border-l border-slate-200 flex justify-between items-center">
          <span>{isCorrectionMode ? '⏱️ Timestamp Correction Mode' : 'Manual Reading Mode (Click any row to focus)'}</span>
          {isCorrectionMode && (
             <span className="text-amber-500 animate-pulse font-black">Calibration Active</span>
          )}
        </div>
      </header>
      
      <main ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar relative">
        <section className="divide-y divide-gray-100 pb-[50vh]">
          {lines.map((block, i) => {
            const isFocused = i === readingIndex;
            return (
              <TranscriptRow 
                key={block.id} 
                index={i}
                block={block} 
                onSeek={onSeek} 
                onVocabClick={onVocabClick} 
                isFocused={isFocused}
                onClick={() => handleFocusSegment(i)}
              />
            );
          })}
        </section>
      </main>

      {menuPos && (
        <ContextMenu 
          x={menuPos.x} 
          y={menuPos.y} 
          onAddToVocab={() => {
            onAddToVocab(selectedText, selectedTime);
            setMenuPos(null);
          }}
          onClose={() => setMenuPos(null)}
        />
      )}
    </div>
  );
}, (prev, next) => prev.lines === next.lines && prev.currentTime === next.currentTime);

export default TranscriptViewer;
