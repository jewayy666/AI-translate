
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
  timestampOffset: number;
  onRightClick: (e: React.MouseEvent, text: string, index: number) => void;
  onVocabJump: (word: string) => void;
  onSeek: (seconds: number) => void;
}

const TranscriptCard: React.FC<TranscriptCardProps> = ({ 
  line, 
  index, 
  vocabulary, 
  timestampOffset,
  onRightClick, 
  onVocabJump,
  onSeek
}) => {
  // Apply the global correction offset
  const baseStartTime = parseTimeToSeconds(line.startTimeInSeconds);
  const adjustedStartTime = Math.max(0, baseStartTime + timestampOffset);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getSpeakerColor = (name: string) => {
    const colors = ['text-blue-600', 'text-purple-600', 'text-emerald-600', 'text-orange-600', 'text-pink-600'];
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
            className="text-red-600 font-bold underline decoration-red-500/50 underline-offset-4 cursor-pointer hover:bg-red-50 px-0.5 rounded transition-colors"
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
      className="mb-6 group animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both relative opacity-90 hover:opacity-100" 
      style={{ animationDelay: `${index * 20}ms` }}
    >
      <div className="flex items-center gap-3 mb-1.5">
        <button 
          onClick={() => onSeek(adjustedStartTime)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold transition-all border bg-white text-slate-500 border-slate-200 hover:border-blue-400 hover:text-blue-600 hover:shadow-sm"
        >
          <Clock className="w-3 h-3" />
          {formatTime(adjustedStartTime)}
        </button>
        <span className={`font-bold text-xs uppercase tracking-widest ${getSpeakerColor(line.speaker)} opacity-60`}>
          {line.speaker}
        </span>
      </div>
      <div className="p-6 rounded-2xl border transition-all duration-300 cursor-help select-text bg-white border-slate-200 shadow-sm group-hover:border-slate-300">
        <div className="text-lg leading-relaxed font-medium text-slate-700">
          {renderHighlightedText(line.english)}
        </div>
        {line.chinese && (
          <div className="mt-3 pt-3 border-t border-slate-200/60 text-sm leading-relaxed text-slate-500">
            {line.chinese}
          </div>
        )}
      </div>
    </div>
  );
};

export default TranscriptCard;
