import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Search,
  Calendar,
  User,
  Activity,
  Download,
  Play,
  Pause,
  Trash2,
  VolumeX,
  FileAudio,
  Check,
  AlertTriangle,
  Loader2,
  Globe,
  Settings,
  Folder,
  FolderPlus,
  Edit2,
  RotateCcw,
  BookOpen
} from "lucide-react";
import { Recording, Category } from "../types";
import { getAudioBlob } from "../lib/db";
import { AudioBookReader } from "./AudioBookReader";

interface HistoryTabProps {
  recordings: Recording[];
  categories: Category[];
  onDeleteRecording: (id: string) => void;
  onClearAll: () => void;
  onCreateCategory: (name: string) => Category;
  onRenameCategory: (id: string, newName: string) => void;
  onDeleteCategory: (id: string) => void;
  onUpdateRecording: (id: string, updates: Partial<Recording>) => void;
}

export default function HistoryTab({
  recordings,
  categories,
  onDeleteRecording,
  onClearAll,
  onCreateCategory,
  onRenameCategory,
  onDeleteCategory,
  onUpdateRecording
}: HistoryTabProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activePlayId, setActivePlayId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showReader, setShowReader] = useState(false);

  // Folder & Renaming States
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const [editingRecordingId, setEditingRecordingId] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editCategoryValue, setEditCategoryValue] = useState("");
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  // Transcoding State
  const [transcodingId, setTranscodingId] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<"mp3" | "wav" | "aac">("mp3");
  const [exportSpeed, setExportSpeed] = useState(1.0);
  const [isTranscoding, setIsTranscoding] = useState(false);

  // Modal active state
  const [showExportModalId, setShowExportModalId] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playProgressRef = useRef<HTMLDivElement | null>(null);

  // Cleanup active playing on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  // Filter recordings by search term and selected folder
  const filteredRecordings = recordings.filter(rec => {
    const matchesSearch =
      rec.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rec.language.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rec.voiceName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (rec.title && rec.title.toLowerCase().includes(searchTerm.toLowerCase()));

    if (selectedCategoryId === "uncategorized") {
      return matchesSearch && !rec.categoryId;
    } else if (selectedCategoryId !== "all") {
      return matchesSearch && rec.categoryId === selectedCategoryId;
    }
    return matchesSearch;
  }).sort((a, b) => b.timestamp - a.timestamp);

  // Load and play a recording
  const playRecording = async (recording: Recording) => {
    const isBook = recording.text.length > 8000;

    // If clicking the currently playing item, toggle play/pause
    if (activePlayId === recording.id) {
      if (isBook) {
        setIsPlaying(!isPlaying);
      } else if (audioRef.current) {
        if (isPlaying) {
          audioRef.current.pause();
          setIsPlaying(false);
          onUpdateRecording(recording.id, { lastPosition: audioRef.current.currentTime });
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
              console.error("Playback failed", err);
            } else {
              console.warn("Playback warning:", err?.message || err);
            }
          });
          setIsPlaying(true);
          setShowReader(true);
        }
      }
      return;
    }

    // Stop and clear previous audio
    if (audioRef.current && activePlayId) {
      audioRef.current.pause();
      onUpdateRecording(activePlayId, { lastPosition: audioRef.current.currentTime });
      audioRef.current = null;
    }
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    if (isBook) {
      setActivePlayId(recording.id);
      setIsPlaying(true);
      setShowReader(true);
      return;
    }

    // Fetch blob from IndexedDB
    const blob = await getAudioBlob(recording.id);
    if (!blob || blob.size <= 44 || recording.mode === "browser-speech") {
      // Direct to immersive reader which handles offline browser-speech fallback automatically
      setActivePlayId(recording.id);
      setIsPlaying(true);
      setShowReader(true);
      return;
    }

    const mimeType = recording.format === "wav" ? "audio/wav" : recording.format === "aac" ? "audio/aac" : "audio/mpeg";
    const cleanBlob = blob.type && blob.type.includes("audio") ? blob : new Blob([blob], { type: mimeType });
    const url = URL.createObjectURL(cleanBlob);
    const audio = new Audio(url);
    audioRef.current = audio;
    setActivePlayId(recording.id);
    setIsPlaying(true);
    setShowReader(true);

    const initialPosition = recording.lastPosition || 0;
    let lastSavedTime = initialPosition;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => {
      setIsPlaying(false);
      onUpdateRecording(recording.id, { lastPosition: audio.currentTime });
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      onUpdateRecording(recording.id, { lastPosition: 0 });
    };
    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (Math.abs(audio.currentTime - lastSavedTime) >= 1.0) {
        lastSavedTime = audio.currentTime;
        onUpdateRecording(recording.id, { lastPosition: audio.currentTime });
      }
    };
    const handleLoadedMetadata = () => {
      const dur = audio.duration || 0;
      setDuration(dur);
      if (!recording.duration || recording.duration !== dur) {
        onUpdateRecording(recording.id, { duration: dur });
      }
      if (initialPosition > 0 && initialPosition < dur) {
        audio.currentTime = initialPosition;
        setCurrentTime(initialPosition);
      }
    };
    const handleAudioError = (e: any) => {
      console.warn("History audio element playback warning:", audio.error || e);
      setIsPlaying(false);
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("error", handleAudioError);

    audio.play().then(() => {
      // Seek after playback start to ensure ready state
      if (initialPosition > 0 && audio.readyState >= 1) {
        const dur = audio.duration || 0;
        if (initialPosition < dur) {
          audio.currentTime = initialPosition;
          setCurrentTime(initialPosition);
        }
      }
    }).catch(err => {
      const isBenign =
        err.name === "AbortError" ||
        err.name === "NotSupportedError" ||
        err.name === "NotAllowedError" ||
        err.message?.toLowerCase().includes("interrupted") ||
        err.message?.toLowerCase().includes("supported") ||
        err.message?.toLowerCase().includes("pause");
      if (!isBenign) {
        console.error("Playback failed", err);
      } else {
        console.warn("Playback warning:", err?.message || err);
      }
      setIsPlaying(false);
    });

    // Handle immediate readiness
    if (audio.readyState >= 1) {
      const dur = audio.duration || 0;
      setDuration(dur);
      if (!recording.duration || recording.duration !== dur) {
        onUpdateRecording(recording.id, { duration: dur });
      }
      if (initialPosition > 0 && initialPosition < dur) {
        audio.currentTime = initialPosition;
        setCurrentTime(initialPosition);
      }
    }
  };

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !playProgressRef.current || duration === 0) return;
    const rect = playProgressRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const newPercentage = clickX / width;
    const newTime = newPercentage * duration;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
    if (activePlayId) {
      onUpdateRecording(activePlayId, { lastPosition: newTime });
    }
  };

  // Convert Blob to Base64 helper
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          const base64 = reader.result.split(",")[1];
          resolve(base64);
        } else {
          reject(new Error("Failed to convert blob to base64"));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Run on-the-fly transcoding and export
  const handleExportAndDownload = async (recording: Recording) => {
    setIsTranscoding(true);
    setTranscodingId(recording.id);

    try {
      const blob = await getAudioBlob(recording.id);
      if (!blob) {
        throw new Error("Local audio file not found in database.");
      }

      const base64Audio = await blobToBase64(blob);

      const res = await fetch("/api/tts/transcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base64Audio,
          format: exportFormat,
          speed: exportSpeed
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to transcode audio.");
      }

      const transcodedBlob = await res.blob();
      const downloadUrl = URL.createObjectURL(transcodedBlob);

      // Trigger browser download
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `exported_speech_${recording.id}_${exportSpeed.toFixed(1)}x.${exportFormat}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);

      // Close modal
      setShowExportModalId(null);
    } catch (err: any) {
      console.error(err);
      setExportError(err.message || "An error occurred during transcoding");
    } finally {
      setIsTranscoding(false);
      setTranscodingId(null);
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8" id="history-container">
      {/* Sidebar: Library Folders */}
      <div className="lg:col-span-3 space-y-4" id="library-sidebar">
        <div className="bg-[#0a0a0a] border border-white/10 rounded-xl p-4 shadow-md space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-white/5">
            <h4 className="text-[11px] uppercase tracking-[0.15em] text-[#a1a1aa] font-bold flex items-center gap-2">
              <Folder className="w-4 h-4 text-white" />
              Library Folders
            </h4>
          </div>

          <div className="space-y-1">
            {/* All recordings item */}
            <button
              id="folder-btn-all"
              onClick={() => setSelectedCategoryId("all")}
              className={`w-full text-left px-3 py-2 rounded text-xs transition-colors flex justify-between items-center ${
                selectedCategoryId === "all"
                  ? "bg-white text-black font-semibold"
                  : "text-[#a1a1aa] hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-2">🗂️ All Conversions</span>
              <span className="text-[10px] font-mono opacity-80">{recordings.length}</span>
            </button>

            {/* Uncategorized item */}
            <button
              id="folder-btn-uncategorized"
              onClick={() => setSelectedCategoryId("uncategorized")}
              className={`w-full text-left px-3 py-2 rounded text-xs transition-colors flex justify-between items-center ${
                selectedCategoryId === "uncategorized"
                  ? "bg-white text-black font-semibold"
                  : "text-[#a1a1aa] hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-2">📁 Uncategorized</span>
              <span className="text-[10px] font-mono opacity-80">
                {recordings.filter((r) => !r.categoryId).length}
              </span>
            </button>

            {/* Custom Categories list */}
            {categories.map((cat) => {
              const count = recordings.filter((r) => r.categoryId === cat.id).length;
              const isSelected = selectedCategoryId === cat.id;
              const isEditing = editingCategoryId === cat.id;

              if (isEditing) {
                return (
                  <div key={cat.id} className="flex gap-1 p-1 bg-[#050505] rounded border border-white/10 mt-1" id={`folder-editing-${cat.id}`}>
                    <input
                      type="text"
                      id={`input-rename-folder-${cat.id}`}
                      value={editCategoryValue}
                      onChange={(e) => setEditCategoryValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          if (editCategoryValue.trim()) {
                            onRenameCategory(cat.id, editCategoryValue.trim());
                            setEditingCategoryId(null);
                          }
                        }
                      }}
                      className="flex-1 bg-transparent px-2 py-0.5 text-xs text-white focus:outline-none"
                    />
                    <button
                      id={`btn-save-folder-${cat.id}`}
                      onClick={() => {
                        if (editCategoryValue.trim()) {
                          onRenameCategory(cat.id, editCategoryValue.trim());
                          setEditingCategoryId(null);
                        }
                      }}
                      className="text-[10px] bg-white text-black font-bold px-2 rounded"
                    >
                      Save
                    </button>
                    <button
                      id={`btn-cancel-folder-${cat.id}`}
                      onClick={() => setEditingCategoryId(null)}
                      className="text-[10px] text-zinc-500 hover:text-white px-1"
                    >
                      X
                    </button>
                  </div>
                );
              }

              return (
                <div
                  key={cat.id}
                  id={`folder-item-${cat.id}`}
                  className={`group relative flex justify-between items-center rounded transition-colors ${
                    isSelected ? "bg-white text-black font-semibold" : "text-[#a1a1aa] hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <button
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className="flex-1 text-left px-3 py-2 text-xs flex items-center justify-between overflow-hidden"
                  >
                    <span className="truncate flex items-center gap-2">📁 {cat.name}</span>
                    <span className="text-[10px] font-mono opacity-80 ml-2">{count}</span>
                  </button>

                  {/* Inline actions visible on hover */}
                  <div className="absolute right-8 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-transparent pr-1">
                    <button
                      id={`btn-edit-folder-${cat.id}`}
                      onClick={() => {
                        setEditingCategoryId(cat.id);
                        setEditCategoryValue(cat.name);
                      }}
                      className="p-1 hover:bg-white/10 rounded text-zinc-400 hover:text-white transition-colors"
                      title="Rename folder"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button
                      id={`btn-delete-folder-${cat.id}`}
                      onClick={() => {
                        if (confirm(`Delete the folder "${cat.name}"? Conversions inside will be kept but set to Uncategorized.`)) {
                          onDeleteCategory(cat.id);
                          if (selectedCategoryId === cat.id) {
                            setSelectedCategoryId("all");
                          }
                        }
                      }}
                      className="p-1 hover:bg-red-950/40 rounded text-zinc-400 hover:text-red-400 transition-colors"
                      title="Delete folder"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Create new folder action */}
          <div className="pt-2 border-t border-white/5">
            {showNewCategoryInput ? (
              <div className="space-y-2 mt-1" id="new-folder-input-container">
                <input
                  type="text"
                  id="input-new-folder-name"
                  placeholder="New folder name..."
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (newCategoryName.trim()) {
                        onCreateCategory(newCategoryName.trim());
                        setNewCategoryName("");
                        setShowNewCategoryInput(false);
                      }
                    }
                  }}
                  className="w-full bg-[#050505] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-zinc-500"
                />
                <div className="flex gap-2">
                  <button
                    id="btn-confirm-create-folder"
                    onClick={() => {
                      if (newCategoryName.trim()) {
                        onCreateCategory(newCategoryName.trim());
                        setNewCategoryName("");
                        setShowNewCategoryInput(false);
                      }
                    }}
                    className="flex-1 py-1 bg-white text-black font-semibold text-xs rounded hover:bg-zinc-200 transition-colors"
                  >
                    Create
                  </button>
                  <button
                    id="btn-cancel-create-folder"
                    onClick={() => {
                      setNewCategoryName("");
                      setShowNewCategoryInput(false);
                    }}
                    className="flex-1 py-1 border border-white/10 hover:bg-white/5 text-zinc-400 hover:text-white text-xs rounded transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                id="btn-add-folder-sidebar"
                onClick={() => setShowNewCategoryInput(true)}
                className="w-full py-1.5 border border-dashed border-white/15 hover:border-white/30 text-[10px] uppercase tracking-wider font-semibold text-zinc-500 hover:text-white rounded transition-colors flex items-center justify-center gap-1.5"
              >
                + New Folder
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Area: Search, Actions, List */}
      <div className="lg:col-span-9 space-y-6" id="library-main-content">
        {/* Action Bar (Search & Purge) */}
        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-[#0a0a0a] border border-white/10 rounded-xl p-4 shadow-md" id="history-header">
          <div className="relative flex-1" id="search-bar">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              id="input-search-history"
              placeholder="Search by title, script text, accents, or voices..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#050505] text-white placeholder-zinc-700 border border-white/10 focus:border-zinc-500 rounded-lg py-2 pl-10 pr-4 text-xs focus:outline-none transition-all font-sans"
            />
          </div>

          {recordings.length > 0 && (
            <div className="flex items-center gap-2">
              {!showClearConfirm ? (
                <button
                  id="btn-confirm-purge"
                  onClick={() => setShowClearConfirm(true)}
                  className="py-2 px-4 bg-transparent hover:bg-red-950/20 border border-white/10 hover:border-red-500/30 text-zinc-400 hover:text-red-400 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors focus:outline-none"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Purge Database
                </button>
              ) : (
                <div className="flex items-center gap-2 bg-[#050505] border border-white/10 p-1.5 rounded-lg">
                  <span className="text-[10px] text-red-400 font-medium px-2 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-red-400" />
                    Are you sure?
                  </span>
                  <button
                    id="btn-cancel-purge"
                    onClick={() => setShowClearConfirm(false)}
                    className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[10px] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    id="btn-execute-purge"
                    onClick={() => {
                      onClearAll();
                      setShowClearConfirm(false);
                      setActivePlayId(null);
                      setIsPlaying(false);
                    }}
                    className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-[10px] transition-colors font-semibold"
                  >
                    Yes, Purge
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Recording Player Bar (Fixed above items when active) */}
        <AnimatePresence>
          {activePlayId && (
            <motion.div
              id="floating-player-bar"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-[#0a0a0a] border border-white/10 p-4 rounded-xl shadow-xl flex flex-col md:flex-row items-center gap-4 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-1 h-full bg-white" />
              
              <div className="flex items-center gap-3">
                <button
                  id="btn-play-pause-floating"
                  onClick={() => {
                    const rec = recordings.find(r => r.id === activePlayId);
                    if (rec) playRecording(rec);
                  }}
                  className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center transition-transform hover:scale-105 focus:outline-none shadow-md"
                >
                  {isPlaying ? <Pause className="w-4 h-4 fill-black" /> : <Play className="w-4 h-4 fill-black ml-0.5" />}
                </button>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500 block font-bold">Now Playing</span>
                  <span className="text-xs text-white truncate max-w-[200px] block">
                    {recordings.find(r => r.id === activePlayId)?.title || recordings.find(r => r.id === activePlayId)?.text || "Historical Speech"}
                  </span>
                </div>
              </div>

              {/* Timeline */}
              <div className="flex-1 w-full flex items-center gap-3">
                <span className="text-[10px] text-zinc-500 font-mono">{formatTime(currentTime)}</span>
                <div
                  ref={playProgressRef}
                  id="floating-timeline-scrub"
                  onClick={handleProgressBarClick}
                  className="h-1 flex-1 bg-zinc-800 rounded-full cursor-pointer relative"
                >
                  <div
                    className="h-full bg-white rounded-full"
                    style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-[10px] text-zinc-500 font-mono">{formatTime(duration)}</span>
              </div>

              <button
                id="btn-close-floating-player"
                onClick={() => {
                  if (audioRef.current) audioRef.current.pause();
                  setActivePlayId(null);
                  setIsPlaying(false);
                }}
                className="text-zinc-400 hover:text-white p-1.5 rounded bg-[#050505] border border-white/10"
              >
                <VolumeX className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Grid of items */}
        {filteredRecordings.length === 0 ? (
          <div className="bg-[#0a0a0a]/50 border border-white/10 rounded-xl p-12 text-center" id="empty-history-panel">
            <FileAudio className="w-10 h-10 text-zinc-700 mx-auto mb-3 animate-pulse" />
            <p className="text-[#a1a1aa] text-xs font-semibold uppercase tracking-wider">No recordings found</p>
            <p className="text-zinc-600 text-xs mt-1">
              {selectedCategoryId !== "all" 
                ? "This folder is currently empty." 
                : "Generate a speech recording and it will appear here."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" id="recordings-list">
            {filteredRecordings.map((rec) => {
              const isPlayingThis = activePlayId === rec.id && isPlaying;
              const isCurrentlySelected = activePlayId === rec.id;
              const formattedDate = new Date(rec.timestamp).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit"
              });

              return (
                <div
                  key={rec.id}
                  id={`recording-card-${rec.id}`}
                  className={`bg-[#0a0a0a] border rounded-xl p-5 shadow-lg flex flex-col justify-between transition-all relative group ${
                    isCurrentlySelected ? "border-white/40 shadow-md" : "border-white/10 hover:border-white/20"
                  }`}
                >
                  <div className="space-y-3">
                    {/* Card Header (Meta tags) */}
                    <div className="flex justify-between items-start">
                      <div className="flex flex-wrap gap-1.5">
                        <span className="text-[9px] bg-white/5 border border-white/10 text-zinc-300 px-2 py-0.5 rounded flex items-center gap-1">
                          <Globe className="w-2.5 h-2.5 text-zinc-400" />
                          {rec.language}
                        </span>
                        <span className="text-[9px] bg-white/5 border border-white/10 text-zinc-300 px-2 py-0.5 rounded flex items-center gap-1">
                          <User className="w-2.5 h-2.5 text-zinc-400" />
                          {rec.voiceName} ({rec.gender === "female" ? "♀" : "♂"})
                        </span>
                      </div>
                      <span className="text-[9px] text-[#52525b] flex items-center gap-1 font-mono">
                        <Calendar className="w-2.5 h-2.5" />
                        {formattedDate}
                      </span>
                    </div>

                    {/* Title and Renaming */}
                    <div className="space-y-1">
                      {editingRecordingId === rec.id ? (
                        <div className="flex items-center gap-1.5" id={`title-edit-container-${rec.id}`}>
                          <input
                            type="text"
                            id={`input-edit-title-${rec.id}`}
                            value={editTitleValue}
                            onChange={(e) => setEditTitleValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                onUpdateRecording(rec.id, { title: editTitleValue.trim() || undefined });
                                setEditingRecordingId(null);
                              }
                            }}
                            className="flex-1 bg-[#050505] text-xs text-white border border-white/20 rounded px-2.5 py-1 focus:outline-none focus:border-white font-sans"
                            autoFocus
                          />
                          <button
                            id={`btn-save-title-${rec.id}`}
                            onClick={() => {
                              onUpdateRecording(rec.id, { title: editTitleValue.trim() || undefined });
                              setEditingRecordingId(null);
                            }}
                            className="px-2.5 py-1 bg-white text-black font-semibold text-[10px] rounded hover:bg-zinc-200 transition-colors"
                          >
                            Save
                          </button>
                          <button
                            id={`btn-cancel-title-${rec.id}`}
                            onClick={() => setEditingRecordingId(null)}
                            className="text-[10px] text-zinc-500 hover:text-white px-1"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between group/title">
                          <h4 className="text-sm font-semibold text-white tracking-tight flex items-center gap-1.5 truncate pr-2">
                            {rec.title || "Untitled Conversion"}
                          </h4>
                          <button
                            id={`btn-trigger-edit-title-${rec.id}`}
                            onClick={() => {
                              setEditingRecordingId(rec.id);
                              setEditTitleValue(rec.title || "");
                            }}
                            className="opacity-0 group-hover/title:opacity-100 hover:text-white text-zinc-500 p-1 rounded transition-opacity"
                            title="Rename conversion"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Audio text snippet */}
                    <div className="bg-[#050505] p-3 border border-white/5 rounded-xl min-h-[50px] relative">
                      <p className="text-zinc-300 text-xs leading-relaxed font-sans line-clamp-3">
                        &ldquo;{rec.text}&rdquo;
                      </p>
                    </div>

                    {/* Progress tracking bar */}
                    {rec.lastPosition && rec.lastPosition > 0 && rec.duration ? (
                      <div className="space-y-1.5 px-1 pt-1">
                        <div className="flex justify-between items-center text-[10px] text-zinc-500 font-mono">
                          <span className="text-zinc-400 flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-teal-400 animate-pulse" />
                            Left off at {formatTime(rec.lastPosition)}
                          </span>
                          <span>{formatTime(rec.duration)}</span>
                        </div>
                        <div className="h-1 bg-zinc-900 rounded-full overflow-hidden border border-white/5">
                          <div
                            className="h-full bg-teal-500 rounded-full"
                            style={{ width: `${(rec.lastPosition / rec.duration) * 100}%` }}
                          />
                        </div>
                      </div>
                    ) : null}

                    {/* Folder Selector Tag inside card */}
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 pt-1">
                      <Folder className="w-3.5 h-3.5 text-zinc-500" />
                      <span className="text-zinc-500">Folder:</span>
                      <select
                        id={`select-folder-card-${rec.id}`}
                        value={rec.categoryId || ""}
                        onChange={(e) => onUpdateRecording(rec.id, { categoryId: e.target.value || undefined })}
                        className="bg-transparent border-none py-0 text-[11px] text-zinc-400 hover:text-white transition-colors cursor-pointer focus:outline-none"
                      >
                        <option value="" className="bg-[#0a0a0a] text-zinc-500">Uncategorized</option>
                        {categories.map(cat => (
                          <option key={cat.id} value={cat.id} className="bg-[#0a0a0a] text-white">
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Footer Controls */}
                  <div className="mt-4 pt-3 border-t border-white/5 flex justify-between items-center">
                    <div className="flex gap-2">
                      {/* Play/Pause Button */}
                      <button
                        id={`btn-play-card-${rec.id}`}
                        onClick={() => playRecording(rec)}
                        className={`text-[10px] uppercase tracking-wider font-bold h-8 px-4 rounded flex items-center gap-1.5 focus:outline-none transition-all ${
                          isPlayingThis
                            ? "bg-white/10 border border-white text-white"
                            : "bg-[#050505] hover:bg-white/5 border border-white/10 text-zinc-300"
                        }`}
                      >
                        {isPlayingThis ? (
                          <>
                            <Pause className="w-3.5 h-3.5 fill-white" /> Playback
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5 fill-zinc-300 ml-0.5" /> {rec.lastPosition && rec.lastPosition > 0 ? "Resume" : "Play"}
                          </>
                        )}
                      </button>

                      {/* Restart / Replay Button if there is saved progress */}
                      {rec.lastPosition && rec.lastPosition > 0 ? (
                        <button
                          id={`btn-restart-card-${rec.id}`}
                          onClick={async (e) => {
                            e.stopPropagation();
                            // Reset position in metadata to 0
                            onUpdateRecording(rec.id, { lastPosition: 0 });
                            // If this is currently the active audio playing, reset its currentTime
                            if (activePlayId === rec.id && audioRef.current) {
                              audioRef.current.currentTime = 0;
                              setCurrentTime(0);
                            } else {
                              // If it's not active, start playing it from 0
                              const updatedRec = { ...rec, lastPosition: 0 };
                              playRecording(updatedRec);
                            }
                          }}
                          className="h-8 w-8 rounded bg-[#050505] hover:bg-white/5 border border-white/10 text-zinc-400 flex items-center justify-center transition-colors focus:outline-none"
                          title="Restart from beginning"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      ) : null}

                      {/* Transcode & Export Button */}
                      <button
                        id={`btn-export-settings-card-${rec.id}`}
                        onClick={() => { setExportError(null); setShowExportModalId(rec.id); }}
                        className="h-8 w-8 rounded bg-transparent hover:bg-white/5 border border-white/10 text-zinc-400 flex items-center justify-center transition-colors focus:outline-none"
                        title="Convert & Export settings"
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Deletion */}
                    <button
                      id={`btn-delete-card-${rec.id}`}
                      onClick={() => onDeleteRecording(rec.id)}
                      className="h-8 w-8 rounded bg-transparent hover:bg-red-950/20 hover:text-red-400 border border-white/10 hover:border-red-900/30 text-zinc-500 flex items-center justify-center transition-all focus:outline-none"
                      title="Delete recording"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Sub-Card Modal: On-the-fly Format & Speed Export */}
                  <AnimatePresence>
                    {showExportModalId === rec.id && (
                      <motion.div
                        id={`export-dialog-${rec.id}`}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="absolute inset-0 bg-[#050505] border border-white/10 rounded-xl p-4 flex flex-col justify-between z-10"
                      >
                        <div className="space-y-4">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-400 flex items-center gap-1">
                              <Settings className="w-3.5 h-3.5 text-zinc-400" /> Export Setup
                            </span>
                            <button
                              id={`btn-close-export-${rec.id}`}
                              onClick={() => setShowExportModalId(null)}
                              className="text-[10px] uppercase text-zinc-500 hover:text-white"
                            >
                              Close
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            {/* Speed adjustment */}
                            <div className="space-y-1">
                              <span className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold block">Pace Speed</span>
                              <select
                                id={`select-export-speed-${rec.id}`}
                                value={exportSpeed}
                                onChange={(e) => setExportSpeed(parseFloat(e.target.value))}
                                className="w-full bg-transparent border-b border-white/20 text-white p-1 text-[11px] focus:outline-none focus:border-white"
                              >
                                <option value="0.5" className="bg-[#050505]">0.5x Slow</option>
                                <option value="0.75" className="bg-[#050505]">0.75x</option>
                                <option value="1.0" className="bg-[#050505]">1.0x Normal</option>
                                <option value="1.25" className="bg-[#050505]">1.25x</option>
                                <option value="1.5" className="bg-[#050505]">1.5x</option>
                                <option value="1.75" className="bg-[#050505]">1.75x</option>
                                <option value="2.0" className="bg-[#050505]">2.0x Fast</option>
                              </select>
                            </div>

                            {/* Format Select */}
                            <div className="space-y-1">
                              <span className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold block">Target Format</span>
                              <select
                                id={`select-export-format-${rec.id}`}
                                value={exportFormat}
                                onChange={(e) => setExportFormat(e.target.value as any)}
                                className="w-full bg-transparent border-b border-white/20 text-white p-1 text-[11px] uppercase font-semibold focus:outline-none focus:border-white"
                              >
                                <option value="mp3" className="bg-[#050505]">MP3 format</option>
                                <option value="wav" className="bg-[#050505]">WAV format</option>
                                <option value="aac" className="bg-[#050505]">AAC format</option>
                              </select>
                            </div>
                          </div>
                        </div>

                        {exportError && (
                          <div className="text-[10px] text-red-400 bg-red-950/20 border border-red-900/30 rounded p-1.5 leading-relaxed">
                            {exportError}
                          </div>
                        )}

                        {/* Transcode Actions */}
                        <button
                          id={`btn-run-export-${rec.id}`}
                          onClick={() => handleExportAndDownload(rec)}
                          disabled={isTranscoding}
                          className="w-full py-2.5 bg-white hover:bg-zinc-200 text-black text-xs font-semibold rounded flex items-center justify-center gap-1.5 shadow-md disabled:opacity-30 focus:outline-none transition-transform active:scale-95"
                        >
                          {isTranscoding && transcodingId === rec.id ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Transcoding...
                            </>
                          ) : (
                            <>
                              <Download className="w-3.5 h-3.5" />
                              Export Offline File
                            </>
                          )}
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Immersive AudioBook Reader Drawer / Modal */}
      <AnimatePresence>
        {showReader && activePlayId && recordings.find(r => r.id === activePlayId) && (
          <AudioBookReader
            recording={recordings.find(r => r.id === activePlayId)!}
            currentTime={currentTime}
            duration={duration}
            isPlaying={isPlaying}
            onPlayPause={() => {
              if (audioRef.current) {
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
                      console.error("Playback failed", err);
                    } else {
                      console.warn("Playback warning:", err?.message || err);
                    }
                  });
                }
              }
            }}
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
        {!showReader && activePlayId && recordings.find(r => r.id === activePlayId) && (
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
