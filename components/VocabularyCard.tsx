
import React from 'react';
import { VocabularyItem } from '../types';

interface VocabularyCardProps {
  item: VocabularyItem;
  index: number;
  onRightClick: (e: React.MouseEvent, word: string, index: number) => void;
  onWordJump: (word: string) => void;
}

const VocabularyCard: React.FC<VocabularyCardProps> = ({ item, index, onRightClick, onWordJump }) => {
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onRightClick(e, item.word, index);
  };

  return (
    <div 
      id={`vocab-${index}`}
      onContextMenu={handleContextMenu}
      className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-lg hover:border-blue-500/30 transition-all group cursor-help scroll-mt-40"
      title="右鍵點擊可加入生詞庫"
    >
      <div className="flex items-baseline gap-3 mb-2 flex-wrap">
        <h3 
          onClick={() => onWordJump(item.word)}
          className="text-xl font-bold text-slate-100 group-hover:text-blue-400 transition-colors cursor-pointer hover:underline underline-offset-4"
          title="點擊跳回逐字稿出現位置"
        >
          {item.word}
        </h3>
        <span className="text-sm font-mono text-slate-500">
          {item.ipa}
        </span>
      </div>
      <p className="text-blue-400 font-medium mb-3 text-sm">
        {item.definition}
      </p>
      <div className="bg-slate-950 p-3 rounded-xl border-l-4 border-blue-500/50">
        <p className="text-sm italic text-slate-400 leading-relaxed">
          "{item.example}"
        </p>
      </div>
    </div>
  );
};

export default VocabularyCard;
