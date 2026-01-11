
import React from 'react';
import { TranscriptLine, Highlight } from '../types';
import { formatTime } from '../utils';

interface VocabSidebarProps {
  lines: TranscriptLine[];
  userVocab?: Highlight[];
  onVocabClick: (time: number, text: string) => void;
  onExport?: () => void;
}

const VocabSidebar: React.FC<VocabSidebarProps> = ({ lines, userVocab = [], onVocabClick, onExport }) => {
  const autoVocab = React.useMemo(() => {
    const vocabMap = new Map<string, { info: Highlight; time: number }>();
    lines.forEach(line => {
      line.segments.forEach(seg => {
        seg.highlights.forEach(h => {
          if (!vocabMap.has(h.text)) {
            vocabMap.set(h.text, { info: h, time: line.startTime });
          }
        });
      });
    });
    return Array.from(vocabMap.values()).sort((a, b) => a.time - b.time);
  }, [lines]);

  const allWords = React.useMemo(() => {
    const userWords = userVocab.map(v => ({ info: v, time: v.timestamp || 0, isUser: true }));
    const autoWords = autoVocab.filter(v => v.info.type === 'word').map(v => ({ ...v, isUser: false }));
    return [...userWords, ...autoWords];
  }, [autoVocab, userVocab]);

  const phrases = autoVocab.filter(v => v.info.type === 'phrase');

  const renderVocabCard = (v: { info: Highlight; time: number, isUser?: boolean }, i: number) => (
    <div 
      key={i} 
      id={`vocab-${v.info.text}`}
      onClick={() => onVocabClick(v.time, v.info.text)}
      className={`p-5 rounded-2xl border transition-all cursor-pointer group shadow-sm ${
        v.isUser 
          ? 'border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-900/10 hover:border-amber-400' 
          : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800/40 hover:border-indigo-300 dark:hover:border-indigo-600 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex flex-col space-y-1">
          <div className="flex items-center space-x-2">
            <span className={`text-xl font-bold transition-colors ${v.isUser ? 'text-amber-900 dark:text-amber-400' : 'text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400'}`}>
              {v.info.text}
            </span>
            {v.info.ipa && (
              <span className="text-sm text-gray-500 dark:text-gray-400 font-mono italic">
                [{v.info.ipa}]
              </span>
            )}
          </div>
          {v.isUser && (
            <span className="w-fit text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-200 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 uppercase tracking-tighter">
              User Note
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            className="p-1.5 rounded-lg bg-slate-100 dark:bg-gray-800 text-slate-400 dark:text-gray-500 hover:bg-indigo-600 hover:text-white transition-colors shadow-sm"
            onClick={(e) => {
              e.stopPropagation();
              onVocabClick(v.time, v.info.text);
            }}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </button>
        </div>
      </div>

      <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mt-3 leading-relaxed">
        {v.info.meaning}
      </p>

      {v.info.example && (
        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900/60 rounded-xl border border-gray-100 dark:border-gray-800">
          <p className="text-base text-gray-600 dark:text-gray-300 italic leading-relaxed">
            "{v.info.example}"
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 transition-colors duration-300">
      <div className="p-4 border-b dark:border-gray-800 bg-slate-50 dark:bg-gray-900 shrink-0 flex items-center justify-between">
        <h3 className="font-bold text-slate-800 dark:text-gray-100 text-sm flex items-center">
          <svg className="w-5 h-5 mr-2 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
          單字庫 ({autoVocab.length + userVocab.length})
        </h3>
        {onExport && (
          <button 
            onClick={onExport}
            className="p-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg flex items-center space-x-1 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            <span>匯出</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-8 bg-slate-50/20 dark:bg-gray-950/20">
        {allWords.length > 0 && (
          <section>
            <h4 className="text-[10px] font-black text-slate-400 dark:text-gray-600 uppercase tracking-widest mb-4 ml-1">Key Vocabulary</h4>
            <div className="space-y-5">
              {allWords.map((v, i) => renderVocabCard(v, i))}
            </div>
          </section>
        )}
        {phrases.length > 0 && (
          <section>
            <h4 className="text-[10px] font-black text-slate-400 dark:text-gray-600 uppercase tracking-widest mb-4 ml-1">Useful Phrases</h4>
            <div className="space-y-5">
              {phrases.map((v, i) => renderVocabCard(v, i))}
            </div>
          </section>
        )}
        {allWords.length === 0 && phrases.length === 0 && (
          <div className="text-center py-20 opacity-30 dark:opacity-20">
            <svg className="w-12 h-12 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 14l9-5-9-5-9 5 9 5z" /><path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" /></svg>
            <p className="text-xs font-bold uppercase tracking-widest">Empty Library</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default VocabSidebar;
