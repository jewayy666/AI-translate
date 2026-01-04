
import React from 'react';
import { TranscriptLine, VocabularyItem } from '../types';

interface TranscriptCardProps {
  line: TranscriptLine;
  index: number;
  vocabulary: VocabularyItem[];
  onRightClick: (e: React.MouseEvent, text: string, index: number) => void;
  onVocabJump: (word: string) => void;
}

const TranscriptCard: React.FC<TranscriptCardProps> = ({ 
  line, 
  index, 
  vocabulary, 
  onRightClick, 
  onVocabJump 
}) => {
  const getSpeakerColor = (name: string) => {
    const colors = ['text-blue-400', 'text-purple-400', 'text-emerald-400', 'text-orange-400', 'text-pink-400'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const selection = window.getSelection()?.toString().trim();
    const textToSave = selection || line.english;
    onRightClick(e, textToSave, index);
  };

  const renderHighlightedText = (text: string) => {
    if (!vocabulary || vocabulary.length === 0) return text;

    const sortedVocab = [...vocabulary].sort((a, b) => b.word.length - a.word.length);
    const words = sortedVocab.map(v => v.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    if (!words) return text;
    
    const regex = new RegExp(`\\b(${words})\\b`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, i) => {
      const isMatch = sortedVocab.some(v => v.word.toLowerCase() === part.toLowerCase());
      if (isMatch) {
        return (
          <span
            key={i}
            onClick={(e) => {
              e.stopPropagation();
              onVocabJump(part.toLowerCase());
            }}
            className="text-red-400 font-bold underline decoration-red-500/50 underline-offset-4 cursor-pointer hover:bg-red-500/10 px-0.5 rounded transition-colors"
            title="點擊查看單字分析"
          >
            {part}
          </span>
        );
      }
      return part;
    });
  };

  return (
    <div 
      id={`transcript-${index}`}
      onContextMenu={handleContextMenu}
      className="mb-6 group animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both relative scroll-mt-40" 
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-baseline mb-1">
        <span className={`font-bold text-xs uppercase tracking-widest ${getSpeakerColor(line.speaker)} opacity-80`}>
          {line.speaker}
        </span>
      </div>
      <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-lg group-hover:border-slate-700 transition-all cursor-help select-text">
        <div className="text-slate-100 text-lg leading-relaxed font-medium mb-3">
          {renderHighlightedText(line.english)}
        </div>
        <p className="text-slate-400 text-sm border-t border-slate-800 pt-3 font-light italic">
          {line.chinese}
        </p>
      </div>
    </div>
  );
};

export default TranscriptCard;
