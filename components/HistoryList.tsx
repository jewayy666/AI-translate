
import React, { useMemo } from 'react';
import { HistoryItem } from '../types';

interface HistoryListProps {
  items: HistoryItem[];
  onSelectItem: (item: HistoryItem) => void;
  onDeleteItem: (id: string) => void;
}

const HistoryList: React.FC<HistoryListProps> = ({ items, onSelectItem, onDeleteItem }) => {
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => b.createdAt - a.createdAt);
  }, [items]);

  if (sortedItems.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="mb-6 inline-block p-4 bg-indigo-50 rounded-full">
           <svg className="w-12 h-12 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-1">尚無歷史記錄</h3>
        <p className="text-gray-500">匯入音檔與逐字稿以開始您的第一個專案。</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {sortedItems.map((item) => (
        <div 
          key={item.id} 
          className="group relative bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden flex flex-col h-full"
        >
          {/* 
            【策略重構】：主點擊層
            使用絕對定位蓋住整個卡片，但 z-index 低於下方的刪除按鈕
          */}
          <div 
            onClick={() => onSelectItem(item)}
            className="absolute inset-0 z-0 cursor-pointer"
            title="點擊進入專案"
          />

          {/* 卡片內容 - 設定 pointer-events-none 確保不干擾點擊層 */}
          <div className="p-6 flex-1 pointer-events-none relative z-10">
            <div className="flex items-center justify-between mb-3">
               <span className="text-[10px] font-bold tracking-wider text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md uppercase">Audio Project</span>
               <span className="text-xs text-gray-400 font-medium">{new Date(item.createdAt).toLocaleDateString()}</span>
            </div>
            <h3 className="text-xl font-bold text-gray-800 line-clamp-1 mb-2 group-hover:text-indigo-600 transition-colors">
              {item.name}
            </h3>
            <p className="text-sm text-gray-500 line-clamp-3 leading-relaxed opacity-80">
              {item.transcript ? item.transcript.substring(0, 120) + '...' : '未提供逐字稿內容'}
            </p>
          </div>
          
          {/* 
            【操作欄】：這裡是關鍵，必須讓內部的按鈕可點擊
          */}
          <div className="px-6 py-4 bg-gray-50/80 border-t border-gray-100 flex justify-between items-center group-hover:bg-white transition-colors relative z-20">
            <div className="text-xs font-bold text-indigo-600 flex items-center pointer-events-none">
              立即開啟
              <svg className="w-4 h-4 ml-1 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </div>
            
            {/* 
              【核心修復】：紅色測試按鈕 
              1. 使用最高 z-index 確保在所有層級之上
              2. 明確 pointer-events-auto 恢復滑鼠事件
              3. onClick 第一行執行 stopPropagation
            */}
            <button 
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation(); // 阻止事件傳遞到卡片
                console.log('--- DELETE TRIGGERED ---');
                alert('正在刪除專案 ID: ' + item.id); // 強制 Alert
                onDeleteItem(item.id);
              }}
              style={{
                position: 'relative',
                zIndex: 9999,
                backgroundColor: '#ef4444',
                color: 'white',
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 'bold',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                cursor: 'pointer',
                border: 'none',
                pointerEvents: 'auto'
              }}
              className="hover:bg-red-700 transition-colors"
            >
              測試刪除
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default HistoryList;
