
import React, { useEffect, useRef, useImperativeHandle, forwardRef, useCallback, useState } from 'react';
import { formatTime } from '../utils';

interface AudioPlayerProps {
  url: string;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  currentTime: number;
  seekTo: (time: number) => void;
  onPrevSegment?: () => void;
  onNextSegment?: () => void;
}

const AudioPlayer = forwardRef<HTMLAudioElement, AudioPlayerProps>(({
  url,
  onTimeUpdate,
  onDurationChange,
  isPlaying,
  setIsPlaying,
  currentTime,
  seekTo,
  onPrevSegment,
  onNextSegment
}, ref) => {
  const localAudioRef = useRef<HTMLAudioElement | null>(null);
  const [volume, setVolume] = useState(1);

  useImperativeHandle(ref, () => localAudioRef.current!);

  useEffect(() => {
    if (!localAudioRef.current) return;
    if (isPlaying) {
      localAudioRef.current.play().catch(e => console.error("Play failed", e));
    } else {
      localAudioRef.current.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    if (localAudioRef.current) {
      localAudioRef.current.volume = volume;
    }
  }, [volume]);

  const handleTimeUpdate = () => {
    if (localAudioRef.current) {
      onTimeUpdate(localAudioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (localAudioRef.current) {
      onDurationChange(localAudioRef.current.duration);
    }
  };

  const skip = useCallback((seconds: number) => {
    if (localAudioRef.current) {
      const newTime = Math.max(0, Math.min(localAudioRef.current.duration, localAudioRef.current.currentTime + seconds));
      localAudioRef.current.currentTime = newTime;
      onTimeUpdate(newTime);
    }
  }, [onTimeUpdate]);

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!localAudioRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickedValue = (x / rect.width) * localAudioRef.current.duration;
    localAudioRef.current.currentTime = clickedValue;
    seekTo(clickedValue);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          setIsPlaying(!isPlaying);
          break;
        case 'ArrowRight':
          e.preventDefault();
          skip(10);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          skip(-10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          onPrevSegment?.();
          break;
        case 'ArrowDown':
          e.preventDefault();
          onNextSegment?.();
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, setIsPlaying, skip, onPrevSegment, onNextSegment]);

  return (
    <div className="w-full h-full flex flex-col justify-center px-4">
      <audio
        ref={localAudioRef}
        src={url}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
      />

      <div className="flex items-center space-x-6">
        {/* 主要控制鈕組 */}
        <div className="flex items-center space-x-2 shrink-0">
          {/* 上一段按鈕 */}
          <button 
            onClick={onPrevSegment}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
            title="上一段 (Up Arrow)"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
          </button>

          <button 
            onClick={() => skip(-10)}
            className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
            title="後退 10 秒 (Left Arrow)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.334 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0111 16V8a1 1 0 00-1.6-.8l-5.334 4z" /></svg>
          </button>

          <button 
            onClick={() => setIsPlaying(!isPlaying)}
            className="w-12 h-12 flex items-center justify-center bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-lg active:scale-95 mx-1"
            title="播放/暫停 (Space)"
          >
            {isPlaying ? (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            ) : (
              <svg className="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            )}
          </button>

          <button 
            onClick={() => skip(10)}
            className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
            title="前進 10 秒 (Right Arrow)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11.933 12.8a1 1 0 000-1.6L6.599 7.2A1 1 0 005 8v8a1 1 0 001.599.8l5.334-4zM19.933 12.8a1 1 0 000-1.6l-5.334-4A1 1 0 0013 8v8a1 1 0 001.599.8l5.334-4z" /></svg>
          </button>

          {/* 下一段按鈕 */}
          <button 
            onClick={onNextSegment}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
            title="下一段 (Down Arrow)"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
          </button>
        </div>

        {/* 進度與時間 */}
        <div className="flex-1 flex flex-col space-y-1">
          <div className="flex justify-between items-center px-1">
            <span className="text-[11px] font-bold font-mono text-indigo-600">{formatTime(currentTime)}</span>
            <span className="text-[11px] font-bold font-mono text-slate-300">{formatTime(localAudioRef.current?.duration || 0)}</span>
          </div>
          <div 
            className="h-2 bg-slate-100 dark:bg-gray-800 rounded-full cursor-pointer relative overflow-hidden"
            onClick={handleProgressClick}
          >
            <div 
              className="absolute top-0 left-0 h-full bg-indigo-500 transition-all duration-100 ease-linear shadow-[0_0_8px_rgba(99,102,241,0.5)]"
              style={{ width: `${(currentTime / (localAudioRef.current?.duration || 1)) * 100}%` }}
            />
          </div>
        </div>

        {/* 音量控制 */}
        <div className="hidden sm:flex items-center space-x-3 shrink-0">
          <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.05" 
            value={volume} 
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-24 h-1 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
        </div>
      </div>
    </div>
  );
});

export default AudioPlayer;
