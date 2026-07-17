import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  Volume2,
  Download,
  Play,
  Pause,
  RotateCcw,
  Languages,
  User,
  HeartHandshake,
  Gauge,
  Music,
  Trash2,
  FileAudio,
  Check,
  AlertCircle,
  FolderPlus,
  Folder,
  Upload,
  FileText,
  Image as ImageIcon,
  Loader2,
  BookOpen,
  Key
} from "lucide-react";
import {
  Recording,
  Category,
  AnalysisResult,
  VOICES,
  LANGUAGES,
  VoiceOption,
  LanguageOption
} from "../types";
import { AudioBookReader } from "./AudioBookReader";
import { splitTextIntoSections } from "../lib/textSplitter";

interface SynthesizerTabProps {
  categories: Category[];
  onCreateCategory: (name: string) => Category;
  onSaveRecording: (recording: Recording, audioBlob: Blob) => void;
}

const TEMPLATES = [
  {
    title: "Supportive Greeting",
    text: "Hello! I hope you are having an absolutely wonderful day today. Remember that you are capable of amazing things, so keep pushing forward!",
    language: "en",
    
    gender: "female"
  },
  {
    title: "Urgent Warning",
    text: "Stop! Please step away from the edge immediately. The system security has been breached, and we must evacuate this sector right now!",
    language: "en",
    
    gender: "male"
  },
  {
    title: "Melancholic Thought",
    text: "Sometimes, the quietest evenings bring the loudest memories. We walk along empty streets, watching dry leaves fall, wondering where time has gone.",
    language: "en",
    
    gender: "female"
  },
  {
    title: "Professional Report",
    text: "Our financial review indicates substantial growth in quarterly revenue. We will proceed with the strategy to optimize administrative costs while scaling cloud infrastructure.",
    language: "en",
    
    gender: "male"
  }
];

export default function SynthesizerTab({ categories, onCreateCategory, onSaveRecording }: SynthesizerTabProps) {
  const [text, setText] = useState("");
  const [selectedLang, setSelectedLang] = useState<LanguageOption>(LANGUAGES[0]);
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>(() => {
    const saved = localStorage.getItem("vocalise_remembered_voice");
    if (saved) {
      const found = VOICES.find(v => v.id === saved);
      if (found) return found;
    }
    return VOICES[0];
  });
  
  const [speed, setSpeed] = useState(1.0);
  const [format, setFormat] = useState<"mp3" | "wav" | "aac">("mp3");

  const [customTitle, setCustomTitle] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState(() => {
    return localStorage.getItem("vocalise_last_folder_id") || "";
  });
  const [showNewCatInput, setShowNewCatInput] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [selectedMode] = useState<"narration">("narration");

  // Document / Screenshot upload & extraction states
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [extractionSuccess, setExtractionSuccess] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedFileType, setUploadedFileType] = useState<string | null>(null);
  const [uploadedFilePreviewUrl, setUploadedFilePreviewUrl] = useState<string | null>(null);
  const [showReader, setShowReader] = useState(false);
  const [lastGeneratedId, setLastGeneratedId] = useState<string | null>(null);
  const [bookNotification, setBookNotification] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const readAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          const base64 = reader.result.split(",")[1];
          resolve(base64);
        } else {
          reject(new Error("Failed to read file as data URL"));
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const processUploadedFile = async (file: File) => {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isImage = file.type.startsWith("image/");
    if (!isPdf && !isImage) {
      setExtractionError("Invalid file type. Please upload a PDF or an image.");
      return;
    }

    setIsExtracting(true);
    setExtractionError(null);
    setExtractionSuccess(false);
    setUploadedFileName(file.name);
    const mimeType = file.type || (isPdf ? "application/pdf" : "image/png");
    setUploadedFileType(mimeType);

    try {
      const base64 = await readAsBase64(file);

      // If it is an image, we can save its data URL to preview the page
      if (isImage) {
        setUploadedFilePreviewUrl(`data:${mimeType};base64,${base64}`);
      } else {
        setUploadedFilePreviewUrl(null); // PDF placeholder
      }

      const res = await fetch("/api/tts/extract-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileBase64: base64,
          mimeType,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to extract text.");
      }

      const data = await res.json();
      if (data.text && data.text.trim()) {
        setText(data.text);
        setExtractionSuccess(true);
      } else {
        throw new Error("No readable text could be extracted from this file.");
      }
    } catch (err: any) {
      console.error("Text extraction failed:", err);
      setExtractionError(err.message || "Failed to extract text from file.");
      setUploadedFileName(null);
      setUploadedFileType(null);
      setUploadedFilePreviewUrl(null);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processUploadedFile(file);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processUploadedFile(file);
    }
  };

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Custom Audio Player State
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playProgressRef = useRef<HTMLDivElement | null>(null);

  // Browser Speech Synthesis fallback state
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speechIntervalRef = useRef<any>(null);

  const startSpeechProgressInterval = () => {
    if (speechIntervalRef.current) {
      clearInterval(speechIntervalRef.current);
    }
    const tickRate = 200;
    const estDuration = Math.max(1, (text.length / 15) / speed);
    speechIntervalRef.current = setInterval(() => {
      setCurrentTime(prev => {
        if (prev >= estDuration) {
          clearInterval(speechIntervalRef.current);
          setIsPlaying(false);
          return 0;
        }
        return prev + (tickRate / 1000);
      });
    }, tickRate);
  };

  const handleLocalSpeechGenerate = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    window.speechSynthesis.cancel();
    if (speechIntervalRef.current) {
      clearInterval(speechIntervalRef.current);
    }

    setGenerationError(null);
    setBookNotification(null);

    // Create a dummy 1-second silent WAV-like blob to unlock visual player card
    const dummyBlob = new Blob([new Uint8Array(44)], { type: "audio/wav" });
    setAudioBlob(dummyBlob);
    setAudioUrl("browser-speech");
    setIsPlaying(false);
    setCurrentTime(0);
    
    const estDuration = Math.max(1, (text.length / 15) / speed);
    setDuration(estDuration);
  };

  // Sync audio ref with state
  useEffect(() => {
    if (audioUrl) {
      if (audioUrl === "browser-speech") {
        audioRef.current = null;
        return () => {
          window.speechSynthesis.cancel();
          if (speechIntervalRef.current) {
            clearInterval(speechIntervalRef.current);
          }
        };
      }
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      const handlePlay = () => setIsPlaying(true);
      const handlePause = () => setIsPlaying(false);
      const handleEnded = () => {
        setIsPlaying(false);
        setCurrentTime(0);
      };
      const handleTimeUpdate = () => {
        setCurrentTime(audio.currentTime);
      };
      const handleLoadedMetadata = () => {
        setDuration(audio.duration || 0);
      };
      const handleAudioError = (e: any) => {
        console.warn("Synthesizer audio element playback warning:", audio.error || e);
        setIsPlaying(false);
      };

      audio.addEventListener("play", handlePlay);
      audio.addEventListener("pause", handlePause);
      audio.addEventListener("ended", handleEnded);
      audio.addEventListener("timeupdate", handleTimeUpdate);
      audio.addEventListener("loadedmetadata", handleLoadedMetadata);
      audio.addEventListener("error", handleAudioError);

      // Explicitly trigger duration check
      if (audio.readyState >= 1) {
        setDuration(audio.duration || 0);
      }

      return () => {
        audio.pause();
        audio.removeEventListener("play", handlePlay);
        audio.removeEventListener("pause", handlePause);
        audio.removeEventListener("ended", handleEnded);
        audio.removeEventListener("timeupdate", handleTimeUpdate);
        audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
        audio.removeEventListener("error", handleAudioError);
        audioRef.current = null;
      };
    }
  }, [audioUrl]);

  const handlePlayPause = () => {
    const isBook = text.trim().length > 8000;
    if (isBook) {
      setIsPlaying(!isPlaying);
      setShowReader(true);
      return;
    }

    if (audioUrl === "browser-speech") {
      if (isPlaying) {
        window.speechSynthesis.pause();
        setIsPlaying(false);
        if (speechIntervalRef.current) {
          clearInterval(speechIntervalRef.current);
        }
      } else {
        setIsPlaying(true);
        if (window.speechSynthesis.paused && utteranceRef.current) {
          window.speechSynthesis.resume();
          startSpeechProgressInterval();
        } else {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.rate = speed;
          if (selectedLang.code) {
            utterance.lang = selectedLang.code;
          }

          const systemVoices = window.speechSynthesis.getVoices();
          const matchingLangVoices = systemVoices.filter(v => v.lang.startsWith(selectedLang.code.split("-")[0]));
          let chosenVoice = matchingLangVoices.find(v => {
            const name = v.name.toLowerCase();
            if (selectedVoice.gender === "female") {
              return name.includes("female") || name.includes("zira") || name.includes("hazel") || name.includes("samantha") || name.includes("moira") || name.includes("tessa");
            } else {
              return name.includes("male") || name.includes("david") || name.includes("mark") || name.includes("george") || name.includes("ravi");
            }
          }) || matchingLangVoices[0] || systemVoices[0];

          if (chosenVoice) {
            utterance.voice = chosenVoice;
          }

          utterance.onend = () => {
            setIsPlaying(false);
            setCurrentTime(0);
            if (speechIntervalRef.current) {
              clearInterval(speechIntervalRef.current);
            }
          };

          utterance.onerror = (e) => {
            console.error("Local speech error:", e);
            setIsPlaying(false);
            if (speechIntervalRef.current) {
              clearInterval(speechIntervalRef.current);
            }
          };

          utterance.onboundary = (event) => {
            if (event.name === "word") {
              const progress = event.charIndex / text.length;
              const estDuration = Math.max(1, (text.length / 15) / speed);
              setCurrentTime(progress * estDuration);
            }
          };

          utteranceRef.current = utterance;
          window.speechSynthesis.speak(utterance);
          startSpeechProgressInterval();
        }
        setShowReader(true);
      }
      return;
    }

    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(err => {
        const isBenign =
          err.name === "AbortError" ||
          err.name === "NotSupportedError" ||
          err.name === "NotAllowedError" ||
          err.message?.toLowerCase().includes("interrupted") ||
          err.message?.toLowerCase().includes("supported") ||
          err.message?.toLowerCase().includes("pause");
        if (!isBenign) {
          console.error("Audio playback failed:", err);
        } else {
          console.warn("Audio playback warning:", err?.message || err);
        }
      });
      setShowReader(true);
    }
  };

  const handleStop = () => {
    if (audioUrl === "browser-speech") {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      setCurrentTime(0);
      if (speechIntervalRef.current) {
        clearInterval(speechIntervalRef.current);
      }
      return;
    }
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setCurrentTime(0);
    setIsPlaying(false);
  };

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (audioUrl === "browser-speech") {
      if (!playProgressRef.current || duration === 0) return;
      const rect = playProgressRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const width = rect.width;
      const newPercentage = clickX / width;
      const newTime = newPercentage * duration;
      setCurrentTime(newTime);
      return;
    }
    if (!audioRef.current || !playProgressRef.current || duration === 0) return;
    const rect = playProgressRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const newPercentage = clickX / width;
    const newTime = newPercentage * duration;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // Apply a template
  const applyTemplate = (tpl: typeof TEMPLATES[0]) => {
    setText(tpl.text);
    const lang = LANGUAGES.find(l => l.code === tpl.language) || LANGUAGES[0];
    setSelectedLang(lang);
    
    
    const voice = VOICES.find(v => v.gender === tpl.gender) || VOICES[0];
    setSelectedVoice(voice);
    localStorage.setItem("vocalise_remembered_voice", voice.id);
  };

  // Generate TTS Audio
  const handleGenerate = async () => {
    if (!text.trim()) return;
    setIsGenerating(true);
    setGenerationError(null);
    setBookNotification(null);

    // Stop current audio
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setAudioUrl(null);
    setAudioBlob(null);

    const isBook = text.trim().length > 8000;
    const sections = isBook ? splitTextIntoSections(text.trim(), 6000) : [text.trim()];
    const textToGenerate = sections[0];

    try {
      if (isBook) {
        setBookNotification(`Optimising audiobook playback... Section 1 (of ${sections.length}) is being vocalised first to ensure instant, zero-wait listening!`);
      }

      const res = await fetch("/api/tts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: textToGenerate,
          voiceName: selectedVoice.id,
          language: selectedLang.name,
          speed,
          format,
          mode: selectedMode,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to generate TTS audio.");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAudioBlob(blob);
      setAudioUrl(url);

      const generatedId = Math.random().toString(36).slice(2, 11);
      setLastGeneratedId(generatedId);

      // Automatically register in local storage history
      const newRecording: Recording = {
        id: generatedId,
        title: customTitle.trim() || undefined,
        categoryId: selectedCategoryId || undefined,
        text: text.trim(), // Keep full text for search and reference
        timestamp: Date.now(),
        voiceName: selectedVoice.name,
        gender: selectedVoice.gender,
        language: selectedLang.name,
        speed,
        format,
        previewUrl: uploadedFilePreviewUrl || undefined,
        fileName: uploadedFileName || undefined,
        fileType: uploadedFileType || undefined,
        mode: selectedMode,
      };

      onSaveRecording(newRecording, blob);
      setCustomTitle(""); // Reset title after successful generation
      // Reset upload states to prepare for the next book/screenshot
      setUploadedFileName(null);
      setUploadedFileType(null);
      setUploadedFilePreviewUrl(null);
      setExtractionSuccess(false);

      if (isBook) {
        // Clear message after successful start
        setTimeout(() => setBookNotification(null), 8000);
      }
    } catch (err: any) {
      console.error(err);
      
      // Auto-trigger browser-speech mode as local fallback so the user is never stuck!
      handleLocalSpeechGenerate();
      
      const errMsg = err.message || "Failed to generate TTS audio.";
      const isQuota = errMsg.toLowerCase().includes("quota") || errMsg.toLowerCase().includes("429") || errMsg.toLowerCase().includes("limit") || errMsg.toLowerCase().includes("exhausted");
      const isKeyMissing = errMsg.toLowerCase().includes("api_key") || errMsg.toLowerCase().includes("defined") || errMsg.toLowerCase().includes("secrets");

      if (isQuota) {
        setGenerationError("Google Gemini API free-tier quota limit reached. Vocalise has automatically activated your browser's local offline speech engine fallback so you can listen instantly by clicking Play/Pause below! Add your own GEMINI_API_KEY in the Settings menu (gear icon) for unlimited high-fidelity voices.");
      } else if (isKeyMissing) {
        setGenerationError("No GEMINI_API_KEY detected in Settings. Vocalise has automatically activated your browser's local offline speech engine fallback so you can listen instantly by clicking Play/Pause below! You can add your personal API key in the top-right Settings menu (gear icon) for high-fidelity Gemini voices.");
      } else {
        setGenerationError(`${errMsg}. Vocalise has automatically activated your browser's local offline speech engine fallback so you can listen instantly by clicking Play/Pause below!`);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <div className="space-y-8" id="synthesizer-panel">
      {/* Input Section */}
      <div className="bg-[#0a0a0a] border border-white/10 rounded-xl p-6 shadow-xl relative overflow-hidden" id="input-container">
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
          <div>
            <h3 className="text-xs uppercase tracking-[0.2em] text-[#a1a1aa] font-bold flex items-center gap-2 font-sans">
              <Sparkles className="w-4 h-4 text-white" />
              Text Input
            </h3>
            <p className="text-[#71717a] text-[11px] mt-0.5">Type or choose from pre-configured speech templates below</p>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#52525b] font-mono">{text.length} characters (Unlimited Words Supported)</span>
            {text && (
              <button
                id="btn-clear-text"
                onClick={() => { setText(""); }}
                className="text-[10px] uppercase tracking-wider px-2 py-1 border border-white/10 hover:bg-white/5 text-zinc-300 rounded transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-4" id="input-fields-grid">
          <div className="lg:col-span-2">
            <textarea
              id="textarea-script"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type or paste your content here... Vocalise will convert your script to high-fidelity synthetic speech."
              className="w-full h-44 bg-[#050505] text-white placeholder-zinc-800 border border-white/10 focus:border-zinc-500 rounded-xl p-6 text-base resize-none focus:outline-none transition-all font-sans leading-relaxed"
            />
          </div>
          
          <div className="lg:col-span-1">
            <div
              id="drag-and-drop-zone"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={triggerFileInput}
              className={`border border-dashed rounded-xl h-44 flex flex-col items-center justify-center p-4 text-center transition-all cursor-pointer relative overflow-hidden select-none ${
                isDragging
                  ? "border-white bg-white/5 shadow-[0_0_15px_rgba(255,255,255,0.05)] animate-pulse"
                  : isExtracting
                  ? "border-white/20 bg-[#050505]"
                  : "border-white/10 hover:border-white/25 hover:bg-white/5 bg-[#050505]"
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="application/pdf,image/*"
                className="hidden"
              />

              <AnimatePresence mode="wait">
                {isExtracting ? (
                  <motion.div
                    key="extracting"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex flex-col items-center gap-2.5"
                  >
                    <Loader2 className="w-8 h-8 text-white animate-spin" />
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-white">Extracting Text...</p>
                      <p className="text-[10px] text-zinc-500 font-mono">Converting with Gemini AI</p>
                    </div>
                  </motion.div>
                ) : uploadedFileName ? (
                  <motion.div
                    key="file-loaded"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex flex-col items-center gap-2 p-2 w-full h-full justify-center"
                  >
                    {uploadedFilePreviewUrl ? (
                      <div className="relative w-14 h-14 rounded-lg overflow-hidden border border-white/15 bg-black/40 shadow-inner">
                        <img
                          src={uploadedFilePreviewUrl}
                          alt="Uploaded Page"
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
                        <FileText className="w-6 h-6" />
                      </div>
                    )}
                    <div className="space-y-0.5 max-w-[180px] text-center">
                      <p className="text-xs font-semibold text-white truncate px-1">{uploadedFileName}</p>
                      <p className="text-[9px] text-zinc-500 uppercase font-mono tracking-wider">
                        {uploadedFileType === "application/pdf" ? "PDF Book" : "Screenshot Page"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent file input trigger
                        setUploadedFileName(null);
                        setUploadedFileType(null);
                        setUploadedFilePreviewUrl(null);
                        setExtractionSuccess(false);
                      }}
                      className="text-[10px] font-medium text-red-400 hover:text-red-300 transition-colors mt-0.5 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded"
                    >
                      Clear File
                    </button>
                  </motion.div>
                ) : extractionError ? (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex flex-col items-center gap-2 p-1"
                  >
                    <AlertCircle className="w-8 h-8 text-red-500" />
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold text-red-200">Extraction Failed</p>
                      <p className="text-[10px] text-red-400 line-clamp-2 leading-tight">{extractionError}</p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExtractionError(null);
                      }}
                      className="text-[9px] uppercase tracking-wider text-zinc-500 hover:text-white underline mt-1"
                    >
                      Retry
                    </button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="idle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center gap-3"
                  >
                    <div className="flex gap-2">
                      <div className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400">
                        <ImageIcon className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-[#a1a1aa] flex items-center gap-1 justify-center">
                        <Upload className="w-3.5 h-3.5 text-zinc-400" />
                        Import PDF / Image
                      </p>
                      <p className="text-[10px] text-[#71717a] leading-tight max-w-[140px] mx-auto">
                        Drop screenshot or PDF here, or click to browse
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Templates Selection */}
        <div className="mt-4" id="templates-section">
          <span className="text-[10px] uppercase tracking-[0.1em] text-[#71717a] font-bold block mb-2">Speech Templates:</span>
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((tpl, idx) => (
              <button
                key={idx}
                id={`template-btn-${idx}`}
                onClick={() => applyTemplate(tpl)}
                className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-[#a1a1aa] hover:text-white px-3 py-1.5 rounded transition-all font-sans"
              >
                {tpl.title}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Parameter Configurations */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8" id="configurations-board">
        {/* Synthesis Settings (Full width since AI Auto-Profiler is removed) */}
        <div className="lg:col-span-12 bg-[#0a0a0a] border border-white/10 rounded-xl p-6 shadow-xl" id="settings-panel">
          <h3 className="text-xs uppercase tracking-[0.15em] text-[#a1a1aa] font-bold mb-6 flex items-center gap-2">
            <Gauge className="w-4 h-4 text-white" />
            Synthesis Configurations
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Language Selection */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.1em] text-[#71717a] font-bold flex items-center gap-1">
                <Languages className="w-3.5 h-3.5" /> Language Accent
              </label>
              <select
                id="select-language"
                value={selectedLang.code}
                onChange={(e) => {
                  const lang = LANGUAGES.find(l => l.code === e.target.value);
                  if (lang) setSelectedLang(lang);
                }}
                className="w-full bg-transparent border-b border-white/20 py-2 text-sm text-white focus:outline-none focus:border-white transition-colors"
              >
                {LANGUAGES.map(lang => (
                  <option key={lang.code} value={lang.code} className="bg-[#0a0a0a] text-white">
                    {lang.flag} {lang.name} ({lang.nativeName})
                  </option>
                ))}
              </select>
            </div>

            {/* Voice Actor Selection */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.1em] text-[#71717a] font-bold flex items-center gap-1">
                <User className="w-3.5 h-3.5" /> Voice Choice
              </label>
              <select
                id="select-voice"
                value={selectedVoice.id}
                onChange={(e) => {
                  const voice = VOICES.find(v => v.id === e.target.value);
                  if (voice) {
                    setSelectedVoice(voice);
                    localStorage.setItem("vocalise_remembered_voice", voice.id);
                  }
                }}
                className="w-full bg-transparent border-b border-white/20 py-2 text-sm text-white focus:outline-none focus:border-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {VOICES.map(voice => (
                  <option key={voice.id} value={voice.id} className="bg-[#0a0a0a] text-white">
                    {voice.gender === "female" ? "♀" : "♂"} {voice.name} — {voice.description}
                  </option>
                ))}
              </select>
            </div>



            {/* Speed & Format Options */}
            <div className="space-y-6">
              {/* Playback speed slider */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] uppercase tracking-[0.1em] text-[#71717a] font-bold flex items-center gap-1">
                    <Gauge className="w-3.5 h-3.5" /> Playback Speed
                  </label>
                  <span className="text-xs text-white font-mono font-semibold">{speed.toFixed(1)}x</span>
                </div>
                <div className="flex items-center gap-4 py-3">
                  <input
                    type="range"
                    id="slider-speed"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={speed}
                    onChange={(e) => setSpeed(parseFloat(e.target.value))}
                    className="flex-1 h-0.5 bg-zinc-800 appearance-none cursor-pointer accent-white"
                  />
                </div>
                <div className="flex justify-between text-[9px] text-[#52525b] font-mono">
                  <span>0.5x Slow</span>
                  <button id="btn-speed-reset" onClick={() => setSpeed(1.0)} className="hover:text-white uppercase tracking-wider text-[8px] font-bold">Reset 1.0x</button>
                  <span>2.0x Fast</span>
                </div>
              </div>

              {/* Export Audio Format */}
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-[0.1em] text-[#71717a] font-bold flex items-center gap-1">
                  <Music className="w-3.5 h-3.5" /> Export Audio Format
                </label>
                <div className="flex bg-zinc-900 rounded p-1 border border-white/5">
                  {(["mp3", "wav", "aac"] as const).map(fmt => (
                    <button
                      key={fmt}
                      id={`format-btn-${fmt}`}
                      onClick={() => setFormat(fmt)}
                      className={`flex-1 py-1 text-[10px] rounded font-semibold transition-all focus:outline-none uppercase ${
                        format === fmt
                          ? "bg-white/10 text-white"
                          : "text-[#71717a] hover:text-white"
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </div>

          {/* Library & Archive Settings */}
          <div className="mt-8 pt-6 border-t border-white/5 space-y-4" id="library-archive-settings">
            <h4 className="text-[10px] uppercase tracking-[0.2em] text-[#a1a1aa] font-bold flex items-center gap-2">
              <Folder className="w-4 h-4 text-white" />
              Library Archival Settings
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Custom Recording Name */}
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-[0.1em] text-[#71717a] font-bold flex items-center gap-1">
                  Recording Name (Optional)
                </label>
                <input
                  type="text"
                  id="input-custom-title"
                  placeholder="e.g. Welcome Greeting, Q3 Narrative..."
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  className="w-full bg-[#050505] text-white placeholder-zinc-800 border border-white/10 focus:border-zinc-500 rounded-lg py-2 px-3 text-sm focus:outline-none transition-all font-sans"
                />
              </div>

              {/* Destination Folder Selector */}
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-[0.1em] text-[#71717a] font-bold flex items-center gap-1">
                  Destination Folder
                </label>
                <div className="flex gap-2">
                  <select
                    id="select-recording-category"
                    value={selectedCategoryId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedCategoryId(val);
                      localStorage.setItem("vocalise_last_folder_id", val);
                    }}
                    className="flex-1 bg-[#0a0a0a] border-b border-white/20 py-1.5 text-sm text-white focus:outline-none focus:border-white transition-colors"
                  >
                    <option value="" className="text-[#71717a]">Uncategorized (Main Library)</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id} className="bg-[#0a0a0a] text-white">
                        📁 {cat.name}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    id="btn-toggle-new-cat"
                    onClick={() => setShowNewCatInput(!showNewCatInput)}
                    className="p-2 border border-white/10 hover:bg-white/5 rounded text-zinc-400 hover:text-white transition-colors flex items-center gap-1 text-[11px]"
                    title="Add new folder"
                  >
                    <FolderPlus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Inline New Category Creation */}
            <AnimatePresence>
              {showNewCatInput && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-[#050505] p-3 border border-white/5 rounded-lg flex items-center gap-2 overflow-hidden"
                  id="inline-new-folder-box"
                >
                  <input
                    type="text"
                    id="input-inline-cat-name"
                    placeholder="Enter new folder name..."
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (newCatName.trim()) {
                          const newCat = onCreateCategory(newCatName.trim());
                          setSelectedCategoryId(newCat.id);
                          localStorage.setItem("vocalise_last_folder_id", newCat.id);
                          setNewCatName("");
                          setShowNewCatInput(false);
                        }
                      }
                    }}
                    className="flex-1 bg-[#0a0a0a] border border-white/10 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-zinc-500"
                  />
                  <button
                    type="button"
                    id="btn-inline-cat-save"
                    onClick={() => {
                      if (newCatName.trim()) {
                        const newCat = onCreateCategory(newCatName.trim());
                        setSelectedCategoryId(newCat.id);
                        localStorage.setItem("vocalise_last_folder_id", newCat.id);
                        setNewCatName("");
                        setShowNewCatInput(false);
                      }
                    }}
                    className="px-3 py-1 bg-white text-black font-semibold text-xs rounded hover:bg-zinc-200 transition-colors"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    id="btn-inline-cat-cancel"
                    onClick={() => {
                      setNewCatName("");
                      setShowNewCatInput(false);
                    }}
                    className="text-xs text-zinc-500 hover:text-white px-2 py-1"
                  >
                    Cancel
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Trigger Generate Button */}
          <div className="mt-8 flex flex-col md:flex-row gap-4 items-center">
            <button
              id="btn-generate-speech"
              onClick={handleGenerate}
              disabled={isGenerating || !text.trim()}
              className="w-full md:flex-1 py-3 px-6 rounded-lg font-semibold text-sm transition-all focus:outline-none flex items-center justify-center gap-2 shadow-lg disabled:opacity-30 disabled:cursor-not-allowed bg-white text-black hover:bg-zinc-200 hover:scale-[1.01]"
            >
              {isGenerating ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-zinc-950/20 border-t-zinc-950 animate-spin" />
                  Generating audio speech...
                </>
              ) : (
                <>
                  <Volume2 className="w-5 h-5" />
                  Synthesize Voice
                </>
              )}
            </button>
          </div>

          {/* Book Mode Notification */}
          <AnimatePresence>
            {bookNotification && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="mt-4 bg-teal-500/5 border border-teal-500/20 rounded-lg p-4 flex items-start gap-3"
              >
                <Sparkles className="w-5 h-5 text-teal-400 flex-shrink-0 mt-0.5 animate-pulse" />
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-teal-200">Book Mode Optimization Active</span>
                  <p className="text-xs text-teal-400/80 leading-relaxed font-sans">{bookNotification}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Error State */}
      <AnimatePresence>
        {generationError && (() => {
          const isQuota =
            generationError.toLowerCase().includes("quota") ||
            generationError.toLowerCase().includes("429") ||
            generationError.toLowerCase().includes("limit") ||
            generationError.toLowerCase().includes("resource_exhausted") ||
            generationError.toLowerCase().includes("exhausted");

          return (
            <motion.div
              id="generation-error-panel"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className={`border rounded-xl p-5 flex items-start gap-3.5 transition-all ${
                isQuota
                  ? "bg-amber-950/10 border-amber-500/20 shadow-lg shadow-amber-950/5"
                  : "bg-red-950/20 border-red-900/40"
              }`}
            >
              {isQuota ? (
                <Key className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5 animate-pulse" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              )}
              <div className="space-y-1.5 flex-1">
                <span className={`text-xs font-semibold ${isQuota ? "text-amber-200" : "text-red-200"}`}>
                  {isQuota ? "Google Gemini Free-Tier Limit Reached" : "Synthesis Failure"}
                </span>
                <p className={`text-xs leading-relaxed ${isQuota ? "text-amber-400/90 font-sans" : "text-red-400"}`}>
                  {isQuota ? (
                    <>
                      You've hit the Gemini API free-tier quota limit (strictly restricted by Google to 10 requests/day per project on the free tier).
                      <br /><br />
                      <strong className="text-white">How to fix this:</strong> Go to the <span className="font-semibold text-white underline">Settings Menu</span> (the gear icon on the top right of AI Studio) and add your personal <strong className="text-white">GEMINI_API_KEY</strong>. 
                      Once added, Vocalise will automatically use your key for unlimited, lightning-fast high-fidelity voice-overs and audiobooks without any daily limit!
                      <br /><br />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleLocalSpeechGenerate}
                          className="py-2 px-4 bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs rounded-lg transition-all flex items-center gap-1.5 shadow-md hover:scale-[1.02]"
                        >
                          <Sparkles className="w-4 h-4" />
                          Use Browser Offline Speech Fallback
                        </button>
                      </div>
                    </>
                  ) : (
                    generationError
                  )}
                </p>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Generation Results Card (Built with premium visualizer & controls) */}
      <AnimatePresence>
        {audioUrl && audioBlob && (
          <motion.div
            id="result-player-panel"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="bg-[#0a0a0a] border border-white/10 rounded-xl p-6 shadow-2xl relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4">
              <span className="text-[10px] bg-white/5 border border-white/10 text-white px-2 py-0.5 rounded font-mono font-medium uppercase">
                {format} Output
              </span>
            </div>

            <h4 className="text-xs uppercase tracking-[0.15em] text-[#71717a] font-bold mb-4 flex items-center gap-2">
              <FileAudio className="w-4 h-4 text-white" />
              Generated Voice Output
            </h4>

            <div className="flex flex-col md:flex-row items-center gap-6 bg-[#050505] p-4 border border-white/5 rounded-xl">
              {/* Playback Controls */}
              <div className="flex items-center gap-3">
                <button
                  id="btn-play-pause-output"
                  onClick={handlePlayPause}
                  className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-all shadow-lg focus:outline-none"
                >
                  {isPlaying ? <Pause className="w-5 h-5 fill-black" /> : <Play className="w-5 h-5 fill-black ml-0.5" />}
                </button>
                <button
                  id="btn-stop-output"
                  onClick={handleStop}
                  className="w-9 h-9 rounded-full bg-transparent hover:bg-white/5 text-zinc-400 border border-white/10 flex items-center justify-center transition-colors focus:outline-none"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>

              {/* Progress Slider & Timeline */}
              <div className="flex-1 w-full space-y-1.5">
                <div
                  ref={playProgressRef}
                  id="progress-scrubber"
                  onClick={handleProgressBarClick}
                  className="h-1 bg-zinc-800 rounded-full cursor-pointer relative overflow-hidden"
                >
                  <div
                    className="h-full bg-white rounded-full transition-all duration-100 ease-linear"
                    style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-[10px] text-[#52525b] font-mono">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Download Action */}
              <div className="w-full md:w-auto flex flex-col sm:flex-row gap-2">
                <a
                  id="link-download-output"
                  href={audioUrl}
                  download={`synthesized_speech_${selectedLang.code}_${selectedVoice.name}.${format}`}
                  className="py-2.5 px-6 bg-transparent border border-white/20 hover:border-white text-white text-xs font-medium rounded-lg transition-all text-center"
                >
                  Export Audio File
                </a>
              </div>
            </div>

            {/* Simulated Waveform Visualization */}
            <div className="mt-4 flex items-center justify-center gap-[3px] h-8 bg-zinc-950/20 rounded-lg overflow-hidden border border-white/5 px-4">
              {Array.from({ length: 48 }).map((_, idx) => {
                // Generate a pseudo random wave height scaled by play state
                const randomHeight = Math.sin(idx * 0.4) * 0.4 + 0.6; // 0.2 to 1.0
                const activeHeight = isPlaying 
                  ? Math.max(10, randomHeight * 32 * (0.4 + Math.random() * 0.6)) 
                  : 4;
                return (
                  <motion.div
                    key={idx}
                    animate={{ height: activeHeight }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className={`w-[3px] rounded-full transition-colors duration-200 ${
                      isPlaying ? "bg-white" : "bg-zinc-800"
                    }`}
                    style={{ height: `${activeHeight}px` }}
                  />
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Immersive AudioBook Reader Drawer / Modal */}
      <AnimatePresence>
        {showReader && audioUrl && text && (
          <AudioBookReader
            recording={{
              id: lastGeneratedId || "preview",
              text: text,
              timestamp: Date.now(),
              voiceName: selectedVoice.name,
              gender: selectedVoice.gender,
              language: selectedLang.name,
              speed,
              format,
              fileName: uploadedFileName || undefined,
              fileType: uploadedFileType || undefined,
              previewUrl: uploadedFilePreviewUrl || undefined,
            }}
            currentTime={currentTime}
            duration={duration}
            isPlaying={isPlaying}
            onPlayPause={handlePlayPause}
            onSeek={(targetTime) => {
              if (audioRef.current) {
                audioRef.current.currentTime = targetTime;
                setCurrentTime(targetTime);
              }
            }}
            onClose={() => setShowReader(false)}
          />
        )}
      </AnimatePresence>

      {/* Floating Pill button if audio is active but reader is closed */}
      <AnimatePresence>
        {!showReader && audioUrl && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 50 }}
            onClick={() => setShowReader(true)}
            className="fixed bottom-6 right-6 z-40 px-5 py-3 rounded-full bg-teal-500 hover:bg-teal-400 text-black font-semibold shadow-lg shadow-teal-500/20 flex items-center gap-2 border border-teal-400/20 hover:scale-105 active:scale-95 transition-all focus:outline-none font-sans"
            id="floating-reader-trigger-button"
          >
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full bg-black opacity-75 ${isPlaying ? "block" : "hidden"}`}></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-black"></span>
            </span>
            <BookOpen className="w-4 h-4 fill-black animate-pulse" />
            <span className="text-xs font-semibold">Open Narrator Reader</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
