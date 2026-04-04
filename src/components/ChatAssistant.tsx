import React, { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { MessageSquare, Mic, Send, X, Bot, User, Loader2, Sparkles, Minimize2, AlertTriangle, Volume2, VolumeX } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { processVoiceCommand } from '../services/geminiService';
import { cn } from '../lib/utils';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: number;
}

interface ChatAssistantProps {
  onTabChange: (tab: 'obd' | 'damage' | 'gps' | 'maintenance') => void;
  onSetNavigation: (from: string, to: string) => void;
  onDiagnose: () => void;
  onMusicControl: (action: string) => void;
}

export interface ChatAssistantHandle {
  toggleMic: () => void;
}

const ChatAssistant = forwardRef<ChatAssistantHandle, ChatAssistantProps>(({ onTabChange, onSetNavigation, onDiagnose, onMusicControl }, ref) => {
  const [isMini, setIsMini] = useState(true);
  const [size, setSize] = useState({ width: 320, height: 450 });
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', text: "Hello! I'm your ZTCD AI Assistant. How can I help you today?", sender: 'ai', timestamp: Date.now() }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const isListeningRef = useRef(false);
  const [isMuted, setIsMuted] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeRecognitionRef = useRef<any>(null);
  const resizeRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    toggleMic: () => {
      setIsMini(false);
      startListening();
    }
  }));

  const speak = useCallback((text: string) => {
    if (isMuted || !text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  }, [isMuted]);

  const handleResize = useCallback((e: MouseEvent | TouchEvent) => {
    if (!resizeRef.current) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const newWidth = Math.max(200, clientX - 16); // 16px margin from left
    const newHeight = Math.max(150, window.innerHeight - clientY - 96); // 96px bottom offset
    
    setSize({ width: newWidth, height: newHeight });
  }, []);

  const stopResize = useCallback(() => {
    window.removeEventListener('mousemove', handleResize);
    window.removeEventListener('mouseup', stopResize);
    window.removeEventListener('touchmove', handleResize);
    window.removeEventListener('touchend', stopResize);
  }, [handleResize]);

  const startResize = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    window.addEventListener('mousemove', handleResize);
    window.addEventListener('mouseup', stopResize);
    window.addEventListener('touchmove', handleResize);
    window.addEventListener('touchend', stopResize);
  }, [handleResize, stopResize]);

  const handleSend = async (text: string) => {
    if (!text.trim()) return;

    if (text.trim().toLowerCase() === "talk to me goose") {
      setInput('');
      startListening();
      return;
    }

    const userMsg: Message = { id: Date.now().toString(), text, sender: 'user', timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    const result = await processVoiceCommand(text);
    
    if (result.functionCalls) {
      for (const call of result.functionCalls) {
        if (call.name === 'changeTab') {
          const args = call.args as { tab: 'obd' | 'damage' | 'gps' };
          onTabChange(args.tab);
        } else if (call.name === 'setNavigation') {
          const args = call.args as { from: string, to: string };
          onSetNavigation(args.from, args.to);
        } else if (call.name === 'diagnoseVehicle') {
          onDiagnose();
        } else if (call.name === 'controlMusic') {
          const args = call.args as { action: string };
          onMusicControl(args.action);
        }
      }
    }

    const aiMsg: Message = { 
      id: (Date.now() + 1).toString(), 
      text: result.text || "Command executed successfully.", 
      sender: 'ai', 
      timestamp: Date.now() 
    };
    setMessages(prev => [...prev, aiMsg]);
    setIsLoading(false);
    speak(aiMsg.text);
  };

  const isStartingRef = useRef(false);

  const startListening = async () => {
    if (isStartingRef.current) return;
    
    if (isListening) {
      activeRecognitionRef.current?.stop();
      return;
    }

    isStartingRef.current = true;
    setMicError(null);

    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error("Speech recognition is not supported in this browser.");
      return;
    }

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
      }
    } catch (err: any) {
      console.error("Microphone access error:", err);
      if (err.name === 'NotAllowedError' || err.message?.includes('Permission denied')) {
        setMicError("Mic blocked");
        isStartingRef.current = false;
        return;
      }
      // If it's a NotFoundError or other error, we log it but still try to start SpeechRecognition
      // which will handle its own errors gracefully.
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      isListeningRef.current = true;
      isStartingRef.current = false;
    };
    recognition.onend = () => {
      setIsListening(false);
      isListeningRef.current = false;
      isStartingRef.current = false;
      activeRecognitionRef.current = null;
    };
    recognition.onerror = (event: any) => {
      if (event.error === 'aborted') {
        setIsListening(false);
        isListeningRef.current = false;
        isStartingRef.current = false;
        return;
      }
      console.error("Speech recognition error:", event.error);
      setMicError(event.error === 'not-allowed' ? "Mic blocked" : "Mic error");
      setIsListening(false);
      isListeningRef.current = false;
      isStartingRef.current = false;
    };
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      handleSend(transcript);
    };

    activeRecognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      console.error("Failed to start speech recognition:", e);
      setIsListening(false);
      isListeningRef.current = false;
      isStartingRef.current = false;
    }
  };

  useEffect(() => {
    return () => {
      if (activeRecognitionRef.current) {
        try { activeRecognitionRef.current.stop(); } catch (e) {}
      }
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <>
      {/* Floating Toggle Button Removed */}

      <AnimatePresence>
          <motion.div
            ref={resizeRef}
            drag
            dragMomentum={false}
            initial={{ opacity: 0, scale: 0.9, y: 20, x: 20 }}
            animate={{ 
              opacity: 1, 
              scale: 1, 
              y: 0, 
              x: 0,
              width: isMini ? 160 : size.width,
              height: isMini ? 120 : size.height
            }}
            exit={{ opacity: 0, scale: 0.9, y: 20, x: 20 }}
            className="fixed top-24 right-4 z-[60] glass-card rounded-2xl overflow-hidden border border-car-accent/30 shadow-2xl flex flex-col"
          >
            {/* Resize Handle (Top-Right) */}
            {!isMini && (
              <div 
                onMouseDown={startResize}
                onTouchStart={startResize}
                className="absolute top-0 right-0 w-6 h-6 cursor-ne-resize z-[70] flex items-center justify-center group"
              >
                <div className="w-1.5 h-1.5 bg-white/20 rounded-full group-hover:bg-car-accent transition-colors" />
              </div>
            )}

            {/* Header */}
            <div className="p-3 bg-car-accent/10 flex items-center justify-between border-b border-white/5 shrink-0">
              <div className="flex items-center gap-2 overflow-hidden">
                <div className="p-1.5 bg-car-accent/20 rounded-lg shrink-0">
                  <Bot size={14} className="text-car-accent" />
                </div>
                {!isMini && <span className="text-[10px] font-bold uppercase tracking-widest text-white/80 truncate">AI Co-Pilot</span>}
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => {
                    setIsMuted(!isMuted);
                    if (!isMuted) window.speechSynthesis.cancel();
                  }} 
                  className="p-1 hover:bg-white/10 rounded-lg text-white/40"
                  title={isMuted ? "Unmute Voice" : "Mute Voice"}
                >
                  {isMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                </button>
                <button 
                  onClick={() => setIsMini(!isMini)} 
                  className="p-1 hover:bg-white/10 rounded-lg text-white/40"
                  title={isMini ? "Expand" : "Mini View"}
                >
                  <Minimize2 size={12} className={cn(isMini && "rotate-180")} />
                </button>
              </div>
            </div>

            {/* Messages - Hidden in Mini Mode */}
            {!isMini ? (
              <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
                {messages.map((msg) => (
                  <div key={msg.id} className={cn("flex", msg.sender === 'user' ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[80%] p-3 rounded-2xl text-xs leading-relaxed",
                      msg.sender === 'user' 
                        ? "bg-car-accent text-white rounded-tr-none" 
                        : "bg-white/5 text-white/80 border border-white/5 rounded-tl-none"
                    )}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white/5 p-3 rounded-2xl rounded-tl-none border border-white/5">
                      <Loader2 size={14} className="text-car-accent animate-spin" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-2">
                {isLoading ? (
                  <Loader2 size={16} className="text-car-accent animate-spin" />
                ) : (
                  <div className="text-center">
                    <p className="text-[8px] text-white/40 uppercase tracking-widest mb-1">Last Msg</p>
                    <p className="text-[10px] text-white/80 line-clamp-2 px-2">
                      {messages[messages.length - 1]?.text}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Input - Hidden in Mini Mode */}
            {!isMini && (
              <div className="p-4 bg-black/20 border-t border-white/5 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSend(input)}
                      placeholder="Ask me..."
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-4 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-car-accent/50"
                    />
                    <button
                      onClick={startListening}
                      className={cn(
                        "absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-colors flex items-center gap-1",
                        isListening ? "text-car-danger animate-pulse" : "text-white/40 hover:text-white",
                        micError && "text-car-warning"
                      )}
                    >
                      {micError && <span className="text-[8px] uppercase font-bold">{micError}</span>}
                      <Mic size={14} />
                    </button>
                  </div>
                  <button
                    onClick={() => handleSend(input)}
                    className="p-2 bg-car-accent text-white rounded-xl hover:bg-car-accent/80 transition-colors"
                  >
                    <Send size={14} />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2 overflow-x-auto scrollbar-hide">
                  <button 
                    onClick={() => handleSend("talk to me goose")}
                    className="whitespace-nowrap px-2 py-1 bg-white/5 rounded-lg text-[8px] text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    "Talk to me goose"
                  </button>
                  <button 
                    onClick={() => handleSend("Switch to Damage Log")}
                    className="whitespace-nowrap px-2 py-1 bg-white/5 rounded-lg text-[8px] text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    Switch Tab
                  </button>
                  <button 
                    onClick={() => handleSend("Diagnose my vehicle")}
                    className="whitespace-nowrap px-2 py-1 bg-white/5 rounded-lg text-[8px] text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    Diagnose
                  </button>
                  <button 
                    onClick={() => handleSend("Play music")}
                    className="whitespace-nowrap px-2 py-1 bg-white/5 rounded-lg text-[8px] text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    Play
                  </button>
                  <button 
                    onClick={() => handleSend("Skip song")}
                    className="whitespace-nowrap px-2 py-1 bg-white/5 rounded-lg text-[8px] text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    Skip
                  </button>
                </div>
              </div>
            )}
          </motion.div>
      </AnimatePresence>
    </>
  );
});

export default ChatAssistant;
