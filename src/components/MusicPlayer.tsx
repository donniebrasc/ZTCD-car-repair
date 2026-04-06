import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Play, Pause, SkipBack, SkipForward, Music, Volume2, X, Minimize2, Maximize2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface Song {
  id: string;
  title: string;
  artist: string;
  duration: string;
  cover: string;
  url: string;
}

const PLAYLIST: Song[] = [
  { id: '1', title: 'Midnight Drive', artist: 'Synthwave Pro', duration: '6:12', cover: 'https://picsum.photos/seed/music1/200/200', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
  { id: '2', title: 'Cyber City', artist: 'Neon Dreams', duration: '7:05', cover: 'https://picsum.photos/seed/music2/200/200', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
  { id: '3', title: 'Electric Horizon', artist: 'Digital Nomad', duration: '5:44', cover: 'https://picsum.photos/seed/music3/200/200', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
  { id: '4', title: 'Techno Pulse', artist: 'Bass Master', duration: '5:02', cover: 'https://picsum.photos/seed/music4/200/200', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3' },
];

export interface MusicPlayerHandle {
  control: (action: string) => void;
}

const MusicPlayer = forwardRef<MusicPlayerHandle>((props, ref) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [currentTimeStr, setCurrentTimeStr] = useState('0:00');
  const [isMini, setIsMini] = useState(true);
  const [volume, setVolume] = useState(75);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const currentSong = PLAYLIST[currentSongIndex];

  useImperativeHandle(ref, () => ({
    control: (action: string) => {
      setIsMini(false); // Expand if mini
      
      switch (action) {
        case 'play':
          setIsPlaying(true);
          break;
        case 'pause':
          setIsPlaying(false);
          break;
        case 'next':
          nextSong();
          break;
        case 'previous':
          prevSong();
          break;
        case 'volume_up':
          setVolume(prev => Math.min(100, prev + 10));
          break;
        case 'volume_down':
          setVolume(prev => Math.max(0, prev - 10));
          break;
      }
    }
  }));

  // Handle play/pause
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(e => {
          // AbortError is expected when play() is interrupted by a new load request or pause()
          if (e.name === 'AbortError') return;
          
          console.error("Audio play failed:", e);
          setIsPlaying(false);
        });
      }
    } else {
      audio.pause();
    }
  }, [isPlaying, currentSongIndex]);

  // Handle volume changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100;
    }
  }, [volume]);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const current = audioRef.current.currentTime;
      const duration = audioRef.current.duration;
      if (duration > 0) {
        setProgress((current / duration) * 100);
      }
      
      // Format current time
      const mins = Math.floor(current / 60);
      const secs = Math.floor(current % 60);
      setCurrentTimeStr(`${mins}:${secs.toString().padStart(2, '0')}`);
    }
  };

  const handleEnded = () => {
    nextSong();
  };

  const togglePlay = () => setIsPlaying(!isPlaying);
  
  const nextSong = () => {
    setCurrentSongIndex((currentSongIndex + 1) % PLAYLIST.length);
    setIsPlaying(true);
  };
  
  const prevSong = () => {
    setCurrentSongIndex((currentSongIndex - 1 + PLAYLIST.length) % PLAYLIST.length);
    setIsPlaying(true);
  };

  return (
    <>
      <audio 
        ref={audioRef} 
        src={currentSong.url} 
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
      />
      
      {/* Toggle Button Removed */}

      <AnimatePresence>
          <motion.div
            drag
            dragMomentum={false}
            initial={{ opacity: 0, scale: 0.9, y: 20, x: -20 }}
            animate={{ 
              opacity: 1, 
              scale: 1, 
              y: 0, 
              x: 0,
              width: isMini ? 200 : 280,
              height: isMini ? 80 : 360
            }}
            exit={{ opacity: 0, scale: 0.9, y: 20, x: -20 }}
            className="fixed bottom-40 left-4 z-[60] glass-card rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="p-3 bg-white/5 flex items-center justify-between border-b border-white/5 shrink-0">
              <div className="flex items-center gap-2">
                <Music size={14} className="text-car-accent" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/80">Media Player</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setIsMini(!isMini)} className="p-1 hover:bg-white/10 rounded-lg text-white/40">
                  {isMini ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
                </button>
              </div>
            </div>

            {/* Content */}
            {!isMini ? (
              <div className="flex-1 p-6 flex flex-col items-center justify-center space-y-6">
                {/* Cover Art */}
                <div className={cn(
                  "relative w-32 h-32 rounded-2xl overflow-hidden shadow-2xl group transition-all duration-500",
                  isPlaying ? "shadow-car-accent/20 scale-105" : "shadow-black/40"
                )}>
                  <img 
                    src={currentSong.cover} 
                    alt={currentSong.title} 
                    className={cn("w-full h-full object-cover transition-transform duration-700", isPlaying ? "scale-110" : "scale-100")}
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                    <div className={cn("w-2 h-2 rounded-full bg-car-accent", isPlaying && "animate-ping")} />
                  </div>
                </div>

                {/* Info */}
                <div className="text-center space-y-1">
                  <h3 className="text-sm font-bold text-white truncate w-48">{currentSong.title}</h3>
                  <p className="text-[10px] text-white/40 uppercase tracking-widest">{currentSong.artist}</p>
                </div>

                {/* Progress */}
                <div className="w-full space-y-2">
                  <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-car-accent" 
                      animate={{ width: `${progress}%` }}
                      transition={{ type: "tween", duration: 0.1 }}
                    />
                  </div>
                  <div className="flex justify-between text-[8px] font-mono text-white/20">
                    <span>{currentTimeStr}</span>
                    <span>{currentSong.duration}</span>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-6">
                  <button onClick={prevSong} className="text-white/40 hover:text-white transition-colors">
                    <SkipBack size={20} />
                  </button>
                  <button 
                    onClick={togglePlay}
                    className="w-12 h-12 rounded-full bg-car-accent text-white flex items-center justify-center hover:bg-car-accent/80 transition-all shadow-lg shadow-car-accent/20"
                  >
                    {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
                  </button>
                  <button onClick={nextSong} className="text-white/40 hover:text-white transition-colors">
                    <SkipForward size={20} />
                  </button>
                </div>

                {/* Volume */}
                <div className="flex items-center gap-3 w-full px-4">
                  <Volume2 size={12} className="text-white/20" />
                  <div className="h-1 flex-1 bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-white/20" 
                      animate={{ width: `${volume}%` }}
                    />
                  </div>
                  <span className="text-[8px] font-mono text-white/20 w-6 text-right">{Math.round(volume)}%</span>
                </div>
              </div>
            ) : (
              <div className="flex-1 px-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0">
                  <img src={currentSong.cover} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[10px] font-bold text-white truncate">{currentSong.title}</h3>
                  <p className="text-[8px] text-white/40 truncate">{currentSong.artist}</p>
                </div>
                <button 
                  onClick={togglePlay}
                  className="w-8 h-8 rounded-full bg-car-accent text-white flex items-center justify-center shrink-0"
                >
                  {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
                </button>
              </div>
            )}
          </motion.div>
      </AnimatePresence>
    </>
  );
});

export default MusicPlayer;
