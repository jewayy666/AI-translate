
import React from 'react';
import { TranscriptLine, VocabularyItem } from '../types';
import { Clock } from 'lucide-react';

// Helper to handle potential string timestamps like "02:08"
export const parseTimeToSeconds = (time: string | number): number => {
  if (typeof time === 'number') return time;
  if (!time) return 0;
  const parts = String(time).split(':').map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1]; // MM:SS
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]; // HH:MM:SS
  }
  return parseFloat(String(time)) || 0;
};

interface TranscriptCardProps {
  line: TranscriptLine;
  index: number;
  vocabulary: VocabularyItem[];
  isActive: boolean;
  onRightClick: (e: React.MouseEvent, text: string, index: number) => void;
  onVocabJump: (word: string) => void;
  onSeek: (seconds: number) => void;
}

const TranscriptCard: React.FC<TranscriptCardProps> = ({ 
  line, 
  index, 
  vocabulary, 
  isActive,
  onRightClick, 
  onVocabJump,
  onSeek
}) => {
  const startTime = parseTimeToSeconds(line.startTimeInSeconds);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

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
      className={`mb-6 group animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both relative transition-all duration-500 ${isActive ? 'scale-[1.02] z-10' : 'opacity-50 hover:opacity-100'}`} 
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <div className="flex items-center gap-3 mb-1.5">
        <button 
          onClick={() => onSeek(startTime)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${isActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40 ring-2 ring-blue-400/20' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}
        >
          <Clock className={`w-3 h-3 ${isActive ? 'animate-pulse' : ''}`} />
          {formatTime(startTime)}
        </button>
        <span className={`font-bold text-xs uppercase tracking-widest ${getSpeakerColor(line.speaker)} ${isActive ? 'opacity-100' : 'opacity-60'}`}>
          {line.speaker}
        </span>
      </div>
      <div className={`bg-slate-900 p-6 rounded-2xl border transition-all duration-500 cursor-help select-text ${isActive ? 'border-blue-500/60 shadow-[0_0_30px_rgba(59,130,246,0.2)] bg-slate-900/50 backdrop-blur-sm' : 'border-slate-800 shadow-lg group-hover:border-slate-700'}`}>
        <div className={`text-slate-100 text-lg leading-relaxed font-medium transition-colors ${isActive ? 'text-white' : 'text-slate-300'}`}>
          {renderHighlightedText(line.english)}
        </div>
        {line.chinese && (
          <div className={`mt-3 pt-3 border-t border-slate-800/50 text-sm leading-relaxed transition-colors ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>
            {line.chinese}
          </div>
        )}
      </div>
    </div>
  );
};

export default TranscriptCard;
