
export interface TranscriptLine {
  speaker: string;
  english: string;
  chinese: string;
  startTimeInSeconds: number;
  endTimeInSeconds: number;
}

export interface VocabularyItem {
  word: string;
  ipa: string;
  definition: string;
  example: string;
}

export interface TranscriptionResult {
  transcript: TranscriptLine[];
  vocabulary: VocabularyItem[];
}

export interface ProcessingStatus {
  step: 'idle' | 'uploading' | 'splitting' | 'transcribing' | 'completed' | 'error';
  message: string;
  progress: number;
}

export interface SavedWord {
  id: string;
  word: string;
  sourceText: string;
  sourceType: 'transcript' | 'vocabulary';
  index: number;
  timestamp: number;
}
