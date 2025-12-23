
export interface Book {
  id: string;
  title: string;
  author: string;
  description: string;
  coverUrl: string;
  category: string;
  duration: string;
  rating: number;
  isGenerated?: boolean;
  content?: string;
}

export interface PlaybackState {
  isPlaying: boolean;
  currentBook: Book | null;
  progress: number;
  speed: number;
  volume: number;
}

export type AppView = 'home' | 'library' | 'studio' | 'stats';
