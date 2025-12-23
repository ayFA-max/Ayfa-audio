
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Home, Library, Mic, BarChart2, Search, Play, Pause, SkipBack, SkipForward, Volume2, Settings, Wand2, Plus, X, Sparkles, Loader2 } from 'lucide-react';
import { Book, AppView, PlaybackState } from './types';
import { MOCK_BOOKS, CATEGORIES } from './constants';
import { geminiService } from './services/geminiService';

const SidebarItem = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
      active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
    }`}
  >
    <Icon size={20} />
    <span className="font-medium">{label}</span>
  </button>
);

// Defined an interface to handle props more cleanly and resolve the 'key' and async 'onPlay' mismatch.
interface BookCardProps {
  book: Book;
  onPlay: (book: Book) => void | Promise<void>;
  isActive: boolean;
}

const BookCard = ({ book, onPlay, isActive }: BookCardProps) => (
  <div className={`group bg-white rounded-2xl p-4 shadow-sm border transition-all duration-300 ${isActive ? 'ring-2 ring-indigo-500 border-indigo-100' : 'border-slate-100 hover:shadow-xl hover:border-indigo-100'}`}>
    <div className="relative aspect-[3/4] rounded-xl overflow-hidden mb-4 shadow-md bg-slate-100">
      <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
        <button 
          onClick={() => onPlay(book)}
          className="bg-white text-indigo-600 p-4 rounded-full shadow-lg hover:scale-110 active:scale-95 transition-transform"
        >
          {isActive ? <Pause fill="currentColor" size={24} /> : <Play fill="currentColor" size={24} />}
        </button>
      </div>
      {book.isGenerated && (
        <div className="absolute top-2 left-2 bg-indigo-600/90 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded-md flex items-center gap-1">
          <Wand2 size={10} /> AI ORIGIN
        </div>
      )}
    </div>
    <h3 className="font-bold text-slate-800 line-clamp-1 group-hover:text-indigo-600 transition-colors">{book.title}</h3>
    <p className="text-sm text-slate-500 mb-2">{book.author}</p>
    <div className="flex items-center justify-between text-xs text-slate-400">
      <span className="bg-slate-100 px-2 py-0.5 rounded-full">{book.category}</span>
      <span>{book.duration}</span>
    </div>
  </div>
);

export default function App() {
  const [activeView, setActiveView] = useState<AppView>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [library, setLibrary] = useState<Book[]>(() => {
    const saved = localStorage.getItem('voxlibre_library');
    return saved ? JSON.parse(saved) : MOCK_BOOKS;
  });

  const [playback, setPlayback] = useState<PlaybackState>({
    isPlaying: false,
    currentBook: null,
    progress: 0,
    speed: 1,
    volume: 80
  });

  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [studioPrompt, setStudioPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState('');

  // Audio Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const offsetRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(0);

  useEffect(() => {
    localStorage.setItem('voxlibre_library', JSON.stringify(library));
  }, [library]);

  const updateProgress = useCallback(() => {
    if (audioCtxRef.current && playback.isPlaying && sourceNodeRef.current?.buffer) {
      const elapsed = audioCtxRef.current.currentTime - startTimeRef.current + offsetRef.current;
      const duration = sourceNodeRef.current.buffer.duration;
      const progressPercent = (elapsed / duration) * 100;
      
      if (progressPercent >= 100) {
        setPlayback(prev => ({ ...prev, isPlaying: false, progress: 0 }));
        offsetRef.current = 0;
        return;
      }

      setPlayback(prev => ({ ...prev, progress: progressPercent }));
      animationFrameRef.current = requestAnimationFrame(updateProgress);
    }
  }, [playback.isPlaying]);

  useEffect(() => {
    if (playback.isPlaying) {
      animationFrameRef.current = requestAnimationFrame(updateProgress);
    } else {
      cancelAnimationFrame(animationFrameRef.current);
    }
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [playback.isPlaying, updateProgress]);

  const stopAudio = () => {
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch (e) {}
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (audioCtxRef.current) {
      offsetRef.current += audioCtxRef.current.currentTime - startTimeRef.current;
      startTimeRef.current = 0;
    }
  };

  const handlePlayPause = () => {
    if (!playback.currentBook) return;
    
    if (playback.isPlaying) {
      stopAudio();
      setPlayback(prev => ({ ...prev, isPlaying: false }));
    } else {
      resumeAudio();
    }
  };

  const resumeAudio = async () => {
    if (!playback.currentBook || !playback.currentBook.content) return;
    
    setPlayback(prev => ({ ...prev, isPlaying: true }));
    
    try {
      if (!audioCtxRef.current) {
        const audioBase64 = await geminiService.generateTTS(playback.currentBook.content);
        const { audioBuffer, audioContext } = await geminiService.getAudioBuffer(audioBase64);
        audioCtxRef.current = audioContext;
        
        const gainNode = audioContext.createGain();
        gainNode.gain.value = playback.volume / 100;
        gainNode.connect(audioContext.destination);
        gainNodeRef.current = gainNode;
        
        // Save buffer for replay
        (audioCtxRef.current as any)._cachedBuffer = audioBuffer;
      }

      const buffer = (audioCtxRef.current as any)._cachedBuffer;
      const source = audioCtxRef.current.createBufferSource();
      source.buffer = buffer;
      source.connect(gainNodeRef.current!);
      
      startTimeRef.current = audioCtxRef.current.currentTime;
      source.start(0, offsetRef.current);
      sourceNodeRef.current = source;
      
      source.onended = () => {
        const elapsed = audioCtxRef.current!.currentTime - startTimeRef.current + offsetRef.current;
        if (elapsed >= buffer.duration - 0.1) {
          setPlayback(prev => ({ ...prev, isPlaying: false, progress: 0 }));
          offsetRef.current = 0;
        }
      };

    } catch (err) {
      console.error("Playback error", err);
      setPlayback(prev => ({ ...prev, isPlaying: false }));
    }
  };

  const handlePlayBook = async (book: Book) => {
    if (playback.currentBook?.id === book.id) {
      handlePlayPause();
      return;
    }

    // New book selected
    stopAudio();
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    offsetRef.current = 0;
    setPlayback(prev => ({ ...prev, currentBook: book, isPlaying: false, progress: 0 }));
    
    // Auto-start
    setTimeout(() => {
      if (book.content) resumeAudio();
      else {
        // Fallback or warning for mock books without content
        setPlayback(prev => ({ ...prev, isPlaying: true }));
        // Just simulate playing for mock books
      }
    }, 100);
  };

  const handleCreateBook = async () => {
    if (!studioPrompt.trim()) return;
    setIsGenerating(true);
    try {
      setGenerationStep('Weaving the story threads...');
      const storyData = await geminiService.generateStory(studioPrompt);
      
      setGenerationStep('Painting the cover art...');
      const coverUrl = await geminiService.generateCover(storyData.title, studioPrompt);
      
      setGenerationStep('Tuning neural voice narration...');
      // Pre-generating first chunk of audio helps initial speed
      const audioBase64 = await geminiService.generateTTS(storyData.content);

      const newBook: Book = {
        id: Date.now().toString(),
        title: storyData.title,
        author: storyData.author,
        description: storyData.description,
        content: storyData.content,
        coverUrl: coverUrl,
        category: 'AI Generated',
        duration: 'Short Story',
        rating: 5.0,
        isGenerated: true
      };

      setLibrary(prev => [newBook, ...prev]);
      setIsStudioOpen(false);
      setStudioPrompt('');
      handlePlayBook(newBook);
    } catch (err) {
      alert("Something went wrong during generation. Please try a different prompt.");
    } finally {
      setIsGenerating(false);
      setGenerationStep('');
    }
  };

  const filteredBooks = library.filter(book => {
    const matchesSearch = book.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         book.author.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || book.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col p-6 hidden md:flex z-30">
        <div className="flex items-center gap-3 mb-10 group cursor-pointer" onClick={() => setActiveView('home')}>
          <div className="bg-indigo-600 p-2.5 rounded-xl text-white group-hover:rotate-12 transition-transform shadow-lg shadow-indigo-100">
            <Mic size={24} />
          </div>
          <h1 className="text-2xl font-serif font-bold tracking-tight text-slate-800">VoxLibre</h1>
        </div>

        <nav className="flex-1 space-y-2">
          <SidebarItem icon={Home} label="Discover" active={activeView === 'home'} onClick={() => setActiveView('home')} />
          <SidebarItem icon={Library} label="Library" active={activeView === 'library'} onClick={() => setActiveView('library')} />
          <SidebarItem icon={BarChart2} label="Insights" active={activeView === 'stats'} onClick={() => setActiveView('stats')} />
          
          <div className="pt-8 pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] px-4">Create</div>
          <button 
            onClick={() => setIsStudioOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-all font-semibold group shadow-sm border border-indigo-100"
          >
            <div className="p-1.5 bg-white rounded-lg shadow-sm group-hover:scale-110 transition-transform">
              <Sparkles size={16} className="text-indigo-600" />
            </div>
            <span>AI Studio</span>
          </button>
        </nav>

        <div className="mt-auto pt-6 border-t border-slate-100">
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 group cursor-pointer hover:bg-white transition-all shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 mb-3 uppercase tracking-widest">CONTINUE LISTENING</p>
            <div className="flex items-center gap-3">
              <img src={library[0]?.coverUrl} className="w-12 h-12 rounded-lg object-cover shadow-sm group-hover:scale-105 transition-transform" />
              <div className="overflow-hidden">
                <p className="text-sm font-bold text-slate-800 line-clamp-1 group-hover:text-indigo-600">{library[0]?.title}</p>
                <div className="w-full h-1 bg-slate-200 rounded-full mt-2">
                  <div className="h-full bg-indigo-500 rounded-full w-1/4"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-20 bg-white/70 backdrop-blur-xl border-b border-slate-100 flex items-center justify-between px-8 sticky top-0 z-20">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search library..." 
              className="w-full bg-slate-100 border-none rounded-2xl py-3 pl-12 pr-4 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-400"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-5">
            <button className="relative p-2.5 text-slate-500 hover:bg-slate-100 rounded-xl transition-all">
              <Settings size={20} />
            </button>
            <div className="flex items-center gap-3 pl-4 border-l border-slate-100">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-slate-800">Alex Vox</p>
                <p className="text-[10px] text-indigo-600 font-semibold uppercase">Premium Member</p>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white flex items-center justify-center font-bold shadow-lg shadow-indigo-100 border-2 border-white">
                AV
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 pb-36 space-y-10 custom-scrollbar">
          {activeView === 'home' && (
            <div className="max-w-7xl mx-auto space-y-12">
              <section className="relative rounded-[40px] overflow-hidden bg-slate-900 text-white p-12 lg:p-16 group">
                <div className="absolute inset-0 overflow-hidden">
                  <div className="absolute -top-24 -right-24 w-96 h-96 bg-indigo-600/30 rounded-full blur-[120px] group-hover:scale-110 transition-transform duration-1000"></div>
                  <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-violet-600/20 rounded-full blur-[120px] group-hover:scale-110 transition-transform duration-1000"></div>
                </div>
                
                <div className="relative z-10 max-w-2xl">
                  <div className="flex items-center gap-2 mb-6">
                    <span className="bg-indigo-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest shadow-lg shadow-indigo-500/20">Featured</span>
                    <span className="text-indigo-300 text-[10px] font-bold uppercase tracking-widest">• 4.2k Active Listeners</span>
                  </div>
                  <h2 className="text-5xl lg:text-6xl font-serif font-bold mb-6 leading-[1.1]">Where Stories Come to Life.</h2>
                  <p className="text-slate-400 text-lg mb-10 leading-relaxed font-light">Experience audiobooks like never before. From global classics to your own AI-generated narratives, VoxLibre is your portal to imagination.</p>
                  <div className="flex flex-wrap gap-4">
                    <button 
                      onClick={() => setIsStudioOpen(true)}
                      className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-bold shadow-xl shadow-indigo-600/30 hover:bg-indigo-500 hover:-translate-y-1 transition-all flex items-center gap-2"
                    >
                      <Plus size={20} /> Create New Audiobook
                    </button>
                    <button className="bg-slate-800 text-white border border-slate-700 px-8 py-4 rounded-2xl font-bold hover:bg-slate-700 transition-all">
                      Browse Trending
                    </button>
                  </div>
                </div>
              </section>

              <section>
                <div className="flex items-center gap-3 mb-8 overflow-x-auto pb-4 no-scrollbar">
                  {CATEGORIES.map(cat => (
                    <button 
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`whitespace-nowrap px-6 py-2.5 rounded-2xl text-sm font-semibold transition-all border ${
                        selectedCategory === cat 
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100' 
                          : 'bg-white text-slate-500 hover:border-slate-300 border-slate-100'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-3xl font-serif font-bold text-slate-800">For You</h3>
                  <button className="text-indigo-600 font-bold text-sm hover:translate-x-1 transition-transform flex items-center gap-1">
                    Explore All <SkipForward size={14} />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-8">
                  {filteredBooks.map(book => (
                    <BookCard 
                      key={book.id} 
                      book={book} 
                      onPlay={handlePlayBook} 
                      isActive={!!(playback.currentBook?.id === book.id && playback.isPlaying)}
                    />
                  ))}
                </div>
              </section>
            </div>
          )}

          {activeView === 'library' && (
             <div className="max-w-7xl mx-auto">
               <div className="flex items-center justify-between mb-10">
                 <h2 className="text-4xl font-serif font-bold">Your Library</h2>
                 <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm">
                   <button className="px-4 py-2 bg-slate-50 rounded-xl text-xs font-bold text-slate-800">All Items</button>
                   <button className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-600">Finished</button>
                 </div>
               </div>
               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-8">
                  {library.map(book => (
                    <BookCard 
                      key={book.id} 
                      book={book} 
                      onPlay={handlePlayBook} 
                      isActive={!!(playback.currentBook?.id === book.id && playback.isPlaying)}
                    />
                  ))}
                </div>
             </div>
          )}

          {activeView === 'stats' && (
            <div className="max-w-5xl mx-auto space-y-8">
               <h2 className="text-4xl font-serif font-bold">Listening Journey</h2>
               <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm">
                    <p className="text-4xl font-bold text-indigo-600 mb-1">24.5h</p>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Total Listening</p>
                  </div>
                  <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm">
                    <p className="text-4xl font-bold text-violet-600 mb-1">12</p>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Books in Library</p>
                  </div>
                  <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm">
                    <p className="text-4xl font-bold text-emerald-500 mb-1">4.8k</p>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">AI Words Narrated</p>
                  </div>
               </div>
               <div className="bg-white rounded-[32px] p-12 border border-slate-100 shadow-sm flex flex-col items-center text-center">
                  <div className="w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 mb-8 animate-pulse">
                    <BarChart2 size={48} />
                  </div>
                  <h3 className="text-2xl font-bold mb-4">Habit Tracker</h3>
                  <p className="text-slate-500 max-w-md leading-relaxed">You've been listening for 5 consecutive days! You're in the top 10% of users this month.</p>
               </div>
            </div>
          )}
        </div>

        {/* Floating Player */}
        <footer className={`fixed bottom-6 left-6 right-6 md:left-[280px] h-24 bg-white/90 backdrop-blur-2xl border border-slate-200/50 rounded-3xl px-8 flex items-center justify-between z-40 transition-all duration-500 shadow-2xl ${playback.currentBook ? 'translate-y-0 opacity-100' : 'translate-y-32 opacity-0'}`}>
          <div className="flex items-center gap-5 w-1/4 min-w-[200px]">
            {playback.currentBook && (
              <>
                <div className="relative group">
                  <img src={playback.currentBook.coverUrl} className="w-16 h-16 rounded-2xl object-cover shadow-lg group-hover:scale-105 transition-transform" />
                  <div className={`absolute -top-1 -right-1 w-3 h-3 bg-indigo-500 rounded-full border-2 border-white ${playback.isPlaying ? 'animate-ping' : ''}`}></div>
                </div>
                <div className="overflow-hidden">
                  <p className="font-bold text-slate-800 line-clamp-1 text-lg leading-none mb-1">{playback.currentBook.title}</p>
                  <p className="text-xs text-slate-400 font-medium line-clamp-1">{playback.currentBook.author}</p>
                </div>
              </>
            )}
          </div>

          <div className="flex flex-col items-center gap-3 flex-1 max-w-2xl px-12">
            <div className="flex items-center gap-8">
              <button className="text-slate-400 hover:text-indigo-600 transition-colors"><SkipBack size={24} /></button>
              <button 
                onClick={handlePlayPause}
                className="bg-indigo-600 text-white p-4 rounded-[20px] shadow-xl shadow-indigo-600/20 hover:scale-110 active:scale-95 transition-all"
              >
                {playback.isPlaying ? <Pause fill="white" size={24} /> : <Play fill="white" size={24} />}
              </button>
              <button className="text-slate-400 hover:text-indigo-600 transition-colors"><SkipForward size={24} /></button>
            </div>
            <div className="w-full flex items-center gap-4">
              <span className="text-[10px] text-slate-400 font-bold tabular-nums">
                {Math.floor(playback.progress * 2)}:{(Math.floor(playback.progress * 1.2) % 60).toString().padStart(2, '0')}
              </span>
              <div className="flex-1 h-1.5 bg-slate-100 rounded-full relative overflow-hidden group cursor-pointer">
                <div 
                  className="absolute top-0 left-0 h-full bg-indigo-600 rounded-full transition-all duration-300 shadow-sm"
                  style={{ width: `${playback.progress}%` }}
                ></div>
              </div>
              <span className="text-[10px] text-slate-400 font-bold tabular-nums">
                {playback.currentBook?.duration || '--:--'}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-6 w-1/4">
            <div className="flex items-center gap-3 group">
              <Volume2 size={20} className="text-slate-400 group-hover:text-indigo-600 transition-colors" />
              <div className="w-24 h-1.5 bg-slate-100 rounded-full relative cursor-pointer overflow-hidden">
                <div 
                  className="absolute top-0 left-0 h-full bg-slate-400 group-hover:bg-indigo-400 transition-colors rounded-full"
                  style={{ width: `${playback.volume}%` }}
                ></div>
              </div>
            </div>
            <button className="px-4 py-1.5 bg-slate-50 rounded-xl text-[10px] font-bold text-slate-600 hover:bg-slate-100 border border-slate-100 transition-all">1.0x</button>
          </div>
        </footer>

        {/* Studio Modal */}
        {isStudioOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-6">
            <div className="bg-white rounded-[40px] w-full max-w-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
              <div className="p-10 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-4">
                  <div className="bg-indigo-600 p-3 rounded-2xl text-white shadow-lg shadow-indigo-100">
                    <Sparkles size={24} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-slate-800">AI Story Studio</h2>
                    <p className="text-sm text-slate-500 font-medium">Create custom audiobooks with Gemini Intelligence</p>
                  </div>
                </div>
                <button 
                  onClick={() => !isGenerating && setIsStudioOpen(false)} 
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-full transition-all shadow-sm"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-10 space-y-8">
                <div className="space-y-4">
                  <label className="block text-sm font-bold text-slate-700 ml-1">What's your story concept?</label>
                  <textarea 
                    disabled={isGenerating}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-[24px] p-6 min-h-[180px] focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder:text-slate-400 text-lg leading-relaxed shadow-inner"
                    placeholder="Describe a character, a world, or a plot twist... e.g. A noir detective story set in a rain-slicked neon city where everyone has forgotten how to sleep."
                    value={studioPrompt}
                    onChange={(e) => setStudioPrompt(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-5 rounded-2xl border border-slate-100 bg-slate-50/50 group hover:border-indigo-200 transition-all cursor-pointer">
                    <p className="text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-widest">NARRATOR</p>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                        <Mic size={14} />
                      </div>
                      <p className="font-bold text-slate-700">Kore (Cinematic)</p>
                    </div>
                  </div>
                  <div className="p-5 rounded-2xl border border-slate-100 bg-slate-50/50 group hover:border-indigo-200 transition-all cursor-pointer">
                    <p className="text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-widest">VISUAL STYLE</p>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-600">
                        <Wand2 size={14} />
                      </div>
                      <p className="font-bold text-slate-700">Digital Impressionism</p>
                    </div>
                  </div>
                </div>

                <div className="relative">
                  {isGenerating && (
                    <div className="absolute -top-12 left-0 right-0 text-center animate-bounce">
                      <p className="text-indigo-600 font-bold text-sm tracking-wide">{generationStep}</p>
                    </div>
                  )}
                  <button 
                    disabled={isGenerating || !studioPrompt.trim()}
                    onClick={handleCreateBook}
                    className={`w-full py-5 rounded-[24px] font-bold text-lg flex items-center justify-center gap-3 transition-all ${
                      isGenerating 
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200' 
                        : 'bg-indigo-600 text-white shadow-2xl shadow-indigo-600/30 hover:bg-indigo-700 hover:-translate-y-1 active:scale-95'
                    }`}
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="animate-spin" size={24} />
                        Synthesizing Magic...
                      </>
                    ) : (
                      <>
                        <Sparkles size={24} />
                        Generate AI Audiobook
                      </>
                    )}
                  </button>
                </div>
              </div>
              
              <div className="px-10 pb-10">
                <div className="p-4 bg-indigo-50/50 rounded-2xl flex items-start gap-3">
                  <div className="p-1.5 bg-white rounded-lg text-indigo-600 shadow-sm mt-0.5">
                    <Settings size={14} />
                  </div>
                  <p className="text-[11px] text-indigo-900/70 leading-relaxed">
                    <strong>Gemini Pro 2.5</strong> will process your prompt to draft a complete narrative, generate specialized cover art, and render a high-fidelity neural voiceover.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
