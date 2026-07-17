import React, { useMemo, useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Play,
  Pause,
  BookOpen,
  FileText,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Volume2,
  CheckCircle2,
  Loader2,
  Sparkles,
  Download,
  Flame,
  VolumeX
} from "lucide-react";
import { Recording, VOICES } from "../types";
import { getAudioBlob, saveAudioBlob } from "../lib/db";
import { splitTextIntoSections } from "../lib/textSplitter";

interface AudioBookReaderProps {
  recording: Recording;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onClose: () => void;
}

export const AudioBookReader: React.FC<AudioBookReaderProps> = ({
  recording,
  currentTime,
  duration,
  isPlaying,
  onPlayPause,
  onSeek,
  onClose
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [showOriginalImage, setShowOriginalImage] = useState(!!recording.previewUrl);

  // Detect if recording is large enough for optimized Book Mode (>8000 characters)
  const isBookMode = recording.text.length > 8000;

  // Split text into optimized sections/pages for instant TTS load and zero timeouts
  const sections = useMemo(() => {
    return splitTextIntoSections(recording.text, 6000);
  }, [recording.text]);

  // Book Mode States
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [synthesizedSections, setSynthesizedSections] = useState<Record<number, boolean>>({});
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthesizingProgress, setSynthesizingProgress] = useState("");
  const [isPreGeneratingAll, setIsPreGeneratingAll] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(recording.speed || 1.0);
  const [showSidebar, setShowSidebar] = useState(true);

  // Internal audio state for Book Mode
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isInternalPlaying, setIsInternalPlaying] = useState(false);
  const [internalCurrentTime, setInternalCurrentTime] = useState(0);
  const [internalDuration, setInternalDuration] = useState(0);

  const internalAudioRef = useRef<HTMLAudioElement | null>(null);
  const shouldAutoPlayRef = useRef(false);

  // Browser Speech Synthesis Fallback State
  const [isLocalSpeech, setIsLocalSpeech] = useState(false);
  const [localSpeechCharIndex, setLocalSpeechCharIndex] = useState<number | null>(null);
  const [readerNotice, setReaderNotice] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speechIntervalRef = useRef<any>(null);

  const startSpeechProgressInterval = () => {
    if (speechIntervalRef.current) {
      clearInterval(speechIntervalRef.current);
    }
    const tickRate = 200;
    const textToSpeak = sections[currentSectionIndex];
    const estDuration = Math.max(1, (textToSpeak.length / 15) / playbackSpeed);
    speechIntervalRef.current = setInterval(() => {
      setInternalCurrentTime(prev => {
        if (prev >= estDuration) {
          clearInterval(speechIntervalRef.current);
          setIsInternalPlaying(false);
          return 0;
        }
        return prev + (tickRate / 1000);
      });
    }, tickRate);
  };

  // Copy/Sync the original recording.id blob to Section 0 if it exists
  useEffect(() => {
    if (isBookMode) {
      const syncInitialSection = async () => {
        try {
          const mainBlob = await getAudioBlob(recording.id);
          const sec0Blob = await getAudioBlob(`${recording.id}_sec_0`);
          if (mainBlob && !sec0Blob) {
            await saveAudioBlob(`${recording.id}_sec_0`, mainBlob);
          }
          
          // Probe which sections have cached audio
          const cachedStatus: Record<number, boolean> = {};
          for (let i = 0; i < sections.length; i++) {
            let exists = await getAudioBlob(`${recording.id}_sec_${i}`);
            if (!exists && i === 0) {
              exists = mainBlob;
            }
            cachedStatus[i] = !!exists;
          }
          setSynthesizedSections(cachedStatus);
        } catch (err) {
          console.error("Failed to sync initial audiobook sections:", err);
        }
      };

      syncInitialSection();
      // Autoplay section 0 if parent's audio was already requested to play
      loadAndPlaySection(0, isPlaying);
    }
  }, [isBookMode, recording.id, sections.length, isPlaying]);

  useEffect(() => {
    return () => {
      // Stop internal audio on unmount
      if (internalAudioRef.current) {
        internalAudioRef.current.pause();
      }
      window.speechSynthesis.cancel();
      if (speechIntervalRef.current) {
        clearInterval(speechIntervalRef.current);
      }
    };
  }, []);

  // Cleanup speech synthesis when section changes
  useEffect(() => {
    window.speechSynthesis.cancel();
    if (speechIntervalRef.current) {
      clearInterval(speechIntervalRef.current);
    }
  }, [currentSectionIndex]);

  // Sync internal HTMLAudioElement for Book Mode
  useEffect(() => {
    if (!isBookMode) return;

    if (audioUrl) {
      if (audioUrl === "browser-speech") {
        internalAudioRef.current = null;
        return () => {
          window.speechSynthesis.cancel();
          if (speechIntervalRef.current) {
            clearInterval(speechIntervalRef.current);
          }
        };
      }
      const audio = new Audio(audioUrl);
      try {
        audio.playbackRate = playbackSpeed;
      } catch (err) {
        console.warn("Setting initial playback rate not supported on this browser:", err);
      }
      internalAudioRef.current = audio;

      const handlePlay = () => setIsInternalPlaying(true);
      const handlePause = () => setIsInternalPlaying(false);
      const handleEnded = () => {
        setIsInternalPlaying(false);
        setInternalCurrentTime(0);
        // Auto-advance to the next section for a continuous listening experience
        if (currentSectionIndex < sections.length - 1) {
          loadAndPlaySection(currentSectionIndex + 1, true);
        }
      };
      const handleTimeUpdate = () => {
        setInternalCurrentTime(audio.currentTime);
      };
      const handleLoadedMetadata = () => {
        setInternalDuration(audio.duration || 0);
        try {
          audio.playbackRate = playbackSpeed;
        } catch (err) {
          console.warn("Updating playback rate on loaded metadata failed:", err);
        }
      };
      const handleAudioError = (e: any) => {
        console.warn("Audio element playback warning (this may be due to browser restriction or format mismatch):", audio.error || e);
        setIsInternalPlaying(false);
      };

      audio.addEventListener("play", handlePlay);
      audio.addEventListener("pause", handlePause);
      audio.addEventListener("ended", handleEnded);
      audio.addEventListener("timeupdate", handleTimeUpdate);
      audio.addEventListener("loadedmetadata", handleLoadedMetadata);
      audio.addEventListener("error", handleAudioError);

      if (audio.readyState >= 1) {
        setInternalDuration(audio.duration || 0);
      }

      if (shouldAutoPlayRef.current) {
        audio.play().catch(err => {
          const isBenign =
            err.name === "AbortError" ||
            err.name === "NotSupportedError" ||
            err.name === "NotAllowedError" ||
            err.message?.toLowerCase().includes("interrupted") ||
            err.message?.toLowerCase().includes("supported") ||
            err.message?.toLowerCase().includes("pause");
          if (!isBenign) {
            console.error("Audio playback error:", err);
          } else {
            console.warn("Audio autoplay warning:", err?.message || err);
          }
        });
        shouldAutoPlayRef.current = false;
      }

      return () => {
        audio.pause();
        audio.removeEventListener("play", handlePlay);
        audio.removeEventListener("pause", handlePause);
        audio.removeEventListener("ended", handleEnded);
        audio.removeEventListener("timeupdate", handleTimeUpdate);
        audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
        audio.removeEventListener("error", handleAudioError);
        internalAudioRef.current = null;
      };
    }
  }, [audioUrl, isBookMode, currentSectionIndex, sections.length, playbackSpeed]);

  // Load and play a specific book section
  const loadAndPlaySection = async (index: number, autoPlay: boolean = false) => {
    if (index < 0 || index >= sections.length) return;

    if (internalAudioRef.current) {
      internalAudioRef.current.pause();
    }
    setAudioUrl(null);
    setInternalCurrentTime(0);
    setInternalDuration(0);
    setIsInternalPlaying(false);

    setCurrentSectionIndex(index);
    shouldAutoPlayRef.current = autoPlay;

    try {
      // 1. Fetch cached section audio from IndexedDB
      let blob = await getAudioBlob(`${recording.id}_sec_${index}`);

      // Fallback for Section 0 to use recording.id blob
      if (!blob && index === 0) {
        const mainBlob = await getAudioBlob(recording.id);
        if (mainBlob) {
          blob = mainBlob;
          await saveAudioBlob(`${recording.id}_sec_0`, mainBlob);
        }
      }

      if (blob && blob.size > 44) {
        const mimeType = recording.format === "wav" ? "audio/wav" : recording.format === "aac" ? "audio/aac" : "audio/mpeg";
        const cleanBlob = blob.type && blob.type.includes("audio") ? blob : new Blob([blob], { type: mimeType });
        const url = URL.createObjectURL(cleanBlob);
        setAudioUrl(url);
        setIsLocalSpeech(false);
        setSynthesizedSections(prev => ({ ...prev, [index]: true }));
        return;
      }

      // If local speech fallback is currently active, or it is a browser-speech recording
      if (isLocalSpeech || recording.mode === "browser-speech" || (blob && blob.size > 0 && blob.size <= 44)) {
        setIsLocalSpeech(true);
        setAudioUrl("browser-speech");
        setIsInternalPlaying(false);
        const textToSpeak = sections[index];
        const estDuration = Math.max(1, (textToSpeak.length / 15) / playbackSpeed);
        setInternalDuration(estDuration);
        setSynthesizedSections(prev => ({ ...prev, [index]: true }));
        return;
      }

      // 2. Synthesize Section on-demand
      setIsSynthesizing(true);
      setSynthesizingProgress(`Vocalising Section ${index + 1} of ${sections.length} with Gemini AI...`);

      const voiceOption = VOICES.find(v => v.name === recording.voiceName) || VOICES[0];
      const res = await fetch("/api/tts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: sections[index],
          voiceName: voiceOption.id,
          language: recording.language,
          speed: recording.speed,
          format: recording.format,
          mode: recording.mode || "narration",
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `Failed to vocalise Section ${index + 1}`);
      }

      const generatedBlob = await res.blob();
      await saveAudioBlob(`${recording.id}_sec_${index}`, generatedBlob);

      const mimeType = recording.format === "wav" ? "audio/wav" : recording.format === "aac" ? "audio/aac" : "audio/mpeg";
      const cleanBlob = generatedBlob.type && generatedBlob.type.includes("audio") ? generatedBlob : new Blob([generatedBlob], { type: mimeType });
      const url = URL.createObjectURL(cleanBlob);
      setAudioUrl(url);
      setIsLocalSpeech(false);
      setSynthesizedSections(prev => ({ ...prev, [index]: true }));

      // Silently cache the next section in background for gapless transition
      prefetchNextSection(index + 1);

    } catch (err: any) {
      console.error(err);
      setIsLocalSpeech(true);
      setAudioUrl("browser-speech");
      setIsInternalPlaying(false);
      const textToSpeak = sections[index];
      const estDuration = Math.max(1, (textToSpeak.length / 15) / playbackSpeed);
      setInternalDuration(estDuration);
      setSynthesizedSections(prev => ({ ...prev, [index]: true }));

      const errMsg = err.message || `Failed to vocalise Section ${index + 1}.`;
      const isQuota = errMsg.toLowerCase().includes("quota") || errMsg.toLowerCase().includes("429") || errMsg.toLowerCase().includes("limit") || errMsg.toLowerCase().includes("exhausted");
      const isKeyMissing = errMsg.toLowerCase().includes("api_key") || errMsg.toLowerCase().includes("defined") || errMsg.toLowerCase().includes("secrets");

      if (isQuota) {
        setReaderNotice({
          message: "Google Gemini free-tier daily quota limit reached. Vocalise has seamlessly activated your browser's local offline speech synthesizer so your reading session is completely uninterrupted! Insert your personal GEMINI_API_KEY in the Settings menu for premium high-fidelity voices.",
          type: "info"
        });
      } else if (isKeyMissing) {
        setReaderNotice({
          message: "No GEMINI_API_KEY detected in Settings. Vocalise has seamlessly activated your browser's local offline speech synthesizer so you can still listen! You can add your personal key in the top-right Settings menu for premium high-fidelity Gemini voices.",
          type: "info"
        });
      } else {
        setReaderNotice({
          message: `Notice: ${errMsg} Vocalise has activated your browser's local offline speech engine fallback so you can continue reading uninterrupted.`,
          type: "info"
        });
      }
    } finally {
      setIsSynthesizing(false);
    }
  };

  // Background caching of the upcoming section for 100% gapless transitions
  const prefetchNextSection = async (nextIndex: number) => {
    if (nextIndex >= sections.length) return;

    try {
      const exists = await getAudioBlob(`${recording.id}_sec_${nextIndex}`);
      if (exists) {
        setSynthesizedSections(prev => ({ ...prev, [nextIndex]: true }));
        return;
      }

      console.log(`Pre-fetching Section ${nextIndex + 1} in background...`);
      const voiceOption = VOICES.find(v => v.name === recording.voiceName) || VOICES[0];
      const res = await fetch("/api/tts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: sections[nextIndex],
          voiceName: voiceOption.id,
          language: recording.language,
          speed: recording.speed,
          format: recording.format,
          mode: recording.mode || "narration",
        }),
      });

      if (res.ok) {
        const generatedBlob = await res.blob();
        await saveAudioBlob(`${recording.id}_sec_${nextIndex}`, generatedBlob);
        setSynthesizedSections(prev => ({ ...prev, [nextIndex]: true }));
        console.log(`Successfully pre-cached Section ${nextIndex + 1} in background!`);
      }
    } catch (err) {
      console.warn("Silent background pre-fetch failed:", err);
    }
  };

  // Bulk vocalise all chapters/sections for 100% offline continuous play
  const preGenerateAllRemaining = async () => {
    if (isPreGeneratingAll) return;
    setIsPreGeneratingAll(true);

    try {
      for (let i = 0; i < sections.length; i++) {
        const exists = await getAudioBlob(`${recording.id}_sec_${i}`);
        if (exists) {
          setSynthesizedSections(prev => ({ ...prev, [i]: true }));
          continue;
        }

        setSynthesizingProgress(`Bulk Vocalising Section ${i + 1} of ${sections.length}...`);
        setIsSynthesizing(true);

        const voiceOption = VOICES.find(v => v.name === recording.voiceName) || VOICES[0];
        const res = await fetch("/api/tts/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: sections[i],
            voiceName: voiceOption.id,
            language: recording.language,
            speed: recording.speed,
            format: recording.format,
            mode: recording.mode || "narration",
          }),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || `Bulk vocalise failed at Section ${i + 1}`);
        }

        const generatedBlob = await res.blob();
        await saveAudioBlob(`${recording.id}_sec_${i}`, generatedBlob);
        setSynthesizedSections(prev => ({ ...prev, [i]: true }));

        // Safe delay to stay completely inside free-tier quota limits
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      setReaderNotice({
        message: "Success! The entire book has been vocalised and cached for 100% offline playback!",
        type: "success"
      });
    } catch (err: any) {
      console.error(err);
      setReaderNotice({
        message: err.message || "An error occurred during bulk generation.",
        type: "error"
      });
    } finally {
      setIsSynthesizing(false);
      setIsPreGeneratingAll(false);
    }
  };

  const handlePlayPauseToggle = () => {
    if (isBookMode) {
      if (audioUrl === "browser-speech") {
        if (isInternalPlaying) {
          window.speechSynthesis.pause();
          setIsInternalPlaying(false);
          if (speechIntervalRef.current) {
            clearInterval(speechIntervalRef.current);
          }
        } else {
          setIsInternalPlaying(true);
          if (window.speechSynthesis.paused && utteranceRef.current) {
            window.speechSynthesis.resume();
            startSpeechProgressInterval();
          } else {
            window.speechSynthesis.cancel();
            setLocalSpeechCharIndex(0);
            const textToSpeak = sections[currentSectionIndex];
            const utterance = new SpeechSynthesisUtterance(textToSpeak);
            utterance.rate = playbackSpeed;

            // Try matching language and voice gender
            if (recording.language) {
              utterance.lang = recording.language === "German" ? "de-DE" :
                               recording.language === "Spanish" ? "es-ES" :
                               recording.language === "French" ? "fr-FR" :
                               recording.language === "Italian" ? "it-IT" :
                               recording.language === "Japanese" ? "ja-JP" : "en-US";
            }

            const systemVoices = window.speechSynthesis.getVoices();
            const matchingLangVoices = systemVoices.filter(v => v.lang.startsWith(utterance.lang.split("-")[0]));
            let chosenVoice = matchingLangVoices.find(v => {
              const name = v.name.toLowerCase();
              if (recording.gender === "female") {
                return name.includes("female") || name.includes("zira") || name.includes("hazel") || name.includes("samantha") || name.includes("moira");
              } else {
                return name.includes("male") || name.includes("david") || name.includes("mark") || name.includes("george");
              }
            }) || matchingLangVoices[0] || systemVoices[0];

            if (chosenVoice) {
              utterance.voice = chosenVoice;
            }

            utterance.onend = () => {
              setIsInternalPlaying(false);
              setInternalCurrentTime(0);
              if (speechIntervalRef.current) {
                clearInterval(speechIntervalRef.current);
              }
              // Auto-advance to next section if available!
              if (currentSectionIndex < sections.length - 1) {
                loadAndPlaySection(currentSectionIndex + 1, true);
              }
            };

            utterance.onerror = (e) => {
              console.error("Local speech error:", e);
              setIsInternalPlaying(false);
              if (speechIntervalRef.current) {
                clearInterval(speechIntervalRef.current);
              }
            };

            utterance.onboundary = (event) => {
              if (event.name === "word") {
                setLocalSpeechCharIndex(event.charIndex);
                const progress = event.charIndex / textToSpeak.length;
                const estDuration = Math.max(1, (textToSpeak.length / 15) / playbackSpeed);
                setInternalCurrentTime(progress * estDuration);
              }
            };

            utteranceRef.current = utterance;
            window.speechSynthesis.speak(utterance);
            startSpeechProgressInterval();
          }
        }
        return;
      }

      if (!internalAudioRef.current) {
        loadAndPlaySection(currentSectionIndex, true);
        return;
      }
      if (isInternalPlaying) {
        internalAudioRef.current.pause();
      } else {
        internalAudioRef.current.play().catch(err => {
          const isBenign =
            err.name === "AbortError" ||
            err.name === "NotSupportedError" ||
            err.name === "NotAllowedError" ||
            err.message?.toLowerCase().includes("interrupted") ||
            err.message?.toLowerCase().includes("supported") ||
            err.message?.toLowerCase().includes("pause");
          if (!isBenign) {
            console.error("Playback failed:", err);
          } else {
            console.warn("Playback warning:", err?.message || err);
          }
        });
      }
    } else {
      onPlayPause();
    }
  };

  const handleSeekPosition = (targetTime: number) => {
    if (isBookMode) {
      if (audioUrl === "browser-speech") {
        setInternalCurrentTime(targetTime);
        return;
      }
      if (internalAudioRef.current) {
        internalAudioRef.current.currentTime = targetTime;
        setInternalCurrentTime(targetTime);
      }
    } else {
      onSeek(targetTime);
    }
  };

  const handlePlaybackSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (audioUrl === "browser-speech") {
      if (isInternalPlaying) {
        window.speechSynthesis.cancel();
        setIsInternalPlaying(false);
        setTimeout(() => {
          setIsInternalPlaying(true);
          setLocalSpeechCharIndex(0);
          const textToSpeak = sections[currentSectionIndex];
          const utterance = new SpeechSynthesisUtterance(textToSpeak);
          utterance.rate = speed;
          if (recording.language) {
            utterance.lang = recording.language === "German" ? "de-DE" :
                             recording.language === "Spanish" ? "es-ES" :
                             recording.language === "French" ? "fr-FR" :
                             recording.language === "Italian" ? "it-IT" :
                             recording.language === "Japanese" ? "ja-JP" : "en-US";
          }
          const systemVoices = window.speechSynthesis.getVoices();
          const matchingLangVoices = systemVoices.filter(v => v.lang.startsWith(utterance.lang.split("-")[0]));
          let chosenVoice = matchingLangVoices.find(v => {
            const name = v.name.toLowerCase();
            if (recording.gender === "female") {
              return name.includes("female") || name.includes("zira") || name.includes("hazel") || name.includes("samantha") || name.includes("moira");
            } else {
              return name.includes("male") || name.includes("david") || name.includes("mark") || name.includes("george");
            }
          }) || matchingLangVoices[0] || systemVoices[0];
          if (chosenVoice) {
            utterance.voice = chosenVoice;
          }
          utterance.onend = () => {
            setIsInternalPlaying(false);
            setInternalCurrentTime(0);
            if (speechIntervalRef.current) {
              clearInterval(speechIntervalRef.current);
            }
            if (currentSectionIndex < sections.length - 1) {
              loadAndPlaySection(currentSectionIndex + 1, true);
            }
          };
          utterance.onerror = () => {
            setIsInternalPlaying(false);
            if (speechIntervalRef.current) {
              clearInterval(speechIntervalRef.current);
            }
          };
          utterance.onboundary = (event) => {
            if (event.name === "word") {
              setLocalSpeechCharIndex(event.charIndex);
              const progress = event.charIndex / textToSpeak.length;
              const estDuration = Math.max(1, (textToSpeak.length / 15) / speed);
              setInternalCurrentTime(progress * estDuration);
            }
          };
          utteranceRef.current = utterance;
          window.speechSynthesis.speak(utterance);
          startSpeechProgressInterval();
        }, 100);
      }
      return;
    }
    if (internalAudioRef.current) {
      internalAudioRef.current.playbackRate = speed;
    }
  };

  const activeDuration = isBookMode ? internalDuration : duration;
  const activeCurrentTime = isBookMode ? internalCurrentTime : currentTime;
  const isCurrentlyPlaying = isBookMode ? isInternalPlaying : isPlaying;

  // Split text into tokens (words and whitespaces) with pause weighting for natural human-like speech timing
  const tokens = useMemo(() => {
    const activeText = isBookMode ? sections[currentSectionIndex] : recording.text;
    if (!activeText) return [];
    
    // Split by whitespace, keeping the spaces and newlines
    const rawTokens = activeText.split(/(\s+)/);
    let cumulativeLength = 0;
    let cumulativeVirtualWeight = 0;
    const wordTokens = [];
    let wordCounter = 0;

    for (const t of rawTokens) {
      if (!t) continue;
      const isWord = !/^\s+$/.test(t);
      const start = cumulativeLength;
      cumulativeLength += t.length;

      // Calculate virtual weight to model natural human pause duration at punctuation/breaks
      let weight = t.length * 1.5;
      if (!isWord) {
        // Multi-newlines (paragraphs), single newline, or general spaces
        if (t.includes("\n\n")) {
          weight = 40; // Long pause at paragraph boundaries
        } else if (t.includes("\n")) {
          weight = 20; // Normal line pause
        } else {
          weight = t.length * 0.5; // Very slight pause between adjacent words
        }
      } else {
        // Trailing punctuation adds virtual duration because the speaker pauses
        if (/[.!?…]$/.test(t) || /[.!?…]"$/.test(t) || /[.!?…]'$/.test(t)) {
          weight += 30; // Sentence-end pauses (highly crucial)
        } else if (/[,;:—\-]$/.test(t) || /[,;:—\-]"\s*$/.test(t)) {
          weight += 15; // Moderate sub-clause pause
        }
      }

      const virtualStart = cumulativeVirtualWeight;
      cumulativeVirtualWeight += weight;

      wordTokens.push({
        text: t,
        isWord,
        startChar: start,
        endChar: cumulativeLength,
        wordIndex: isWord ? wordCounter++ : -1,
        virtualStart,
        virtualEnd: cumulativeVirtualWeight,
      });
    }
    return wordTokens;
  }, [isBookMode, sections, currentSectionIndex, recording.text]);

  const totalVirtualWeight = useMemo(() => {
    if (tokens.length === 0) return 0;
    return tokens[tokens.length - 1].virtualEnd;
  }, [tokens]);

  const activeTokenIndex = useMemo(() => {
    if (tokens.length === 0) return -1;
    if (activeDuration === 0) return 0;
    
    // 1. Precise tracking for local browser-synthesized voice using the boundary event index
    if (isLocalSpeech && localSpeechCharIndex !== null) {
      const index = tokens.findIndex((t) => localSpeechCharIndex >= t.startChar && localSpeechCharIndex < t.endChar);
      if (index !== -1) {
        if (!tokens[index].isWord) {
          for (let i = index; i < tokens.length; i++) {
            if (tokens[i].isWord) return i;
          }
          for (let i = index; i >= 0; i--) {
            if (tokens[i].isWord) return i;
          }
        }
        return index;
      }
    }

    // 2. Intelligent weighted timeline tracking for Gemini TTS pre-rendered audio
    // Compensation for initial 0.5s starting silence in Gemini audio
    const delay = 0.5; 
    const effectiveTime = Math.max(0, activeCurrentTime - delay);
    
    // Scale timeline to 100% duration
    const effectiveDuration = activeDuration * 1.0;
    const ratio = effectiveDuration > 0 ? Math.min(1, effectiveTime / effectiveDuration) : 0;
    
    const targetVirtualWeight = totalVirtualWeight * ratio;

    // Find the token matching this virtual weight position
    const index = tokens.findIndex((t) => targetVirtualWeight >= t.virtualStart && targetVirtualWeight < t.virtualEnd);
    if (index !== -1) {
      if (!tokens[index].isWord) {
        // Find adjacent actual word token
        for (let i = index; i < tokens.length; i++) {
          if (tokens[i].isWord) return i;
        }
        for (let i = index; i >= 0; i--) {
          if (tokens[i].isWord) return i;
        }
      }
      return index;
    }
    
    return tokens.findIndex(t => t.isWord);
  }, [activeCurrentTime, activeDuration, totalVirtualWeight, tokens, isLocalSpeech, localSpeechCharIndex]);

  const handleWordClick = (startChar: number, virtualStart: number) => {
    if (activeDuration === 0 || totalVirtualWeight === 0) return;
    const ratio = virtualStart / totalVirtualWeight;
    const targetTime = ratio * activeDuration;
    handleSeekPosition(targetTime);
  };

  const handleSkipBack = () => {
    if (isBookMode) {
      if (activeCurrentTime > 5) {
        handleSeekPosition(activeCurrentTime - 5);
      } else if (currentSectionIndex > 0) {
        loadAndPlaySection(currentSectionIndex - 1, true);
      }
    } else {
      handleSeekPosition(Math.max(0, activeCurrentTime - 5));
    }
  };

  const handleSkipForward = () => {
    if (isBookMode) {
      if (activeDuration - activeCurrentTime > 5) {
        handleSeekPosition(activeCurrentTime + 5);
      } else if (currentSectionIndex < sections.length - 1) {
        loadAndPlaySection(currentSectionIndex + 1, true);
      }
    } else {
      handleSeekPosition(Math.min(activeDuration, activeCurrentTime + 5));
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      className={`fixed bottom-6 left-6 right-6 lg:left-1/2 lg:-translate-x-1/2 z-50 bg-[#0c0c0e]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 flex flex-col ${
        isMaximized
          ? "w-[calc(100vw-3rem)] h-[calc(100vh-6rem)] top-12"
          : "w-[calc(100vw-3rem)] max-w-5xl h-[580px]"
      }`}
      id="audiobook-reader-container"
    >
      {/* Upper border glow */}
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-teal-500/20 to-transparent pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
            <BookOpen className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              {recording.title || "Untitled Recording"}
              {isBookMode && sections.length > 1 && (
                <span className="text-[10px] font-mono text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/15">
                  Optimized Book Player Mode
                </span>
              )}
              {recording.fileName && (
                <span className="text-[10px] font-mono text-zinc-500 bg-white/5 px-2 py-0.5 rounded border border-white/5 max-w-[120px] truncate">
                  {recording.fileName}
                </span>
              )}
            </h3>
            <p className="text-[10px] text-zinc-400 font-medium">
              Vocalise Reader &bull; {recording.voiceName} &bull; {sections.length > 1 ? `${sections.length} Chapters/Pages` : "Single Page"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isBookMode && sections.length > 1 && (
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-all ${
                showSidebar
                  ? "bg-teal-500/15 border-teal-500/30 text-teal-300"
                  : "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
              }`}
              title="Toggle chapter list"
            >
              <span>Chapters ({sections.length})</span>
            </button>
          )}

          {recording.previewUrl && (
            <button
              onClick={() => setShowOriginalImage(!showOriginalImage)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-all ${
                showOriginalImage
                  ? "bg-teal-500/15 border-teal-500/30 text-teal-300"
                  : "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
              }`}
              title="Toggle original uploaded document preview"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>{showOriginalImage ? "Hide Original" : "Show Original"}</span>
            </button>
          )}

          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
            title={isMaximized ? "Minimize reader" : "Maximize reader"}
          >
            {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-red-500/10 hover:text-red-400 border border-white/5 hover:border-red-500/20 flex items-center justify-center text-zinc-400 transition-all"
            title="Close reader"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* On-Demand Synthesizing Blur Overlay */}
        <AnimatePresence>
          {isSynthesizing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#070708]/90 z-30 backdrop-blur-md flex flex-col items-center justify-center gap-4 text-center p-6"
            >
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-t-2 border-r-2 border-teal-500 animate-spin" />
                <Sparkles className="w-6 h-6 text-teal-400 absolute inset-0 m-auto animate-pulse" />
              </div>
              <div className="space-y-1.5 max-w-sm">
                <h4 className="text-sm font-semibold text-white tracking-wide">Vocalising Book Text...</h4>
                <p className="text-xs text-zinc-400 font-mono leading-relaxed">{synthesizingProgress}</p>
                <div className="w-48 h-1.5 bg-zinc-900 rounded-full mx-auto overflow-hidden border border-white/5 mt-3">
                  <div className="h-full bg-teal-500 animate-pulse w-full" />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Left Side chapter/section playlist (Book Mode only) */}
        <AnimatePresence initial={false}>
          {isBookMode && showSidebar && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: isMaximized ? "280px" : "240px", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="border-r border-white/5 bg-[#09090b]/80 h-full flex flex-col"
              id="reader-chapters-panel"
            >
              <div className="p-4 border-b border-white/5 bg-white/[0.01] flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold">Book Chapters</span>
                
                {/* Bulk synthesize button */}
                <button
                  onClick={preGenerateAllRemaining}
                  disabled={isPreGeneratingAll}
                  className="px-2 py-1 rounded bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 hover:text-teal-300 border border-teal-500/20 text-[10px] font-mono transition-all flex items-center gap-1 disabled:opacity-50"
                  title="Synthesize the remaining sections of the book for seamless offline reading"
                >
                  {isPreGeneratingAll ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Download className="w-3 h-3" />
                  )}
                  <span>Vocalise All</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {sections.map((sec, idx) => {
                  const isActive = idx === currentSectionIndex;
                  const isReady = synthesizedSections[idx];
                  const wordCount = sec.split(/\s+/).length;

                  return (
                    <button
                      key={idx}
                      onClick={() => loadAndPlaySection(idx, true)}
                      className={`w-full text-left p-2.5 rounded-lg flex items-start gap-2.5 transition-all relative group ${
                        isActive
                          ? "bg-teal-500/10 border border-teal-500/20 text-teal-300"
                          : "hover:bg-white/5 border border-transparent text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      <div className="mt-0.5">
                        {isReady ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <div className="w-3.5 h-3.5 rounded-full border border-dashed border-zinc-600 flex items-center justify-center text-[8px] font-mono text-zinc-500">
                            •
                          </div>
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">Section {idx + 1}</p>
                        <p className="text-[10px] font-mono text-zinc-500 mt-0.5 flex justify-between">
                          <span>{wordCount} words</span>
                          <span>{isReady ? "Ready" : "On-Demand"}</span>
                        </p>
                      </div>

                      {/* Hover Play icon indicator */}
                      {!isActive && (
                        <div className="absolute right-2 top-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Play className="w-3 h-3 text-teal-400 fill-teal-400/20" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Left/Middle Side: Original Document Preview screenshot */}
        <AnimatePresence initial={false}>
          {showOriginalImage && recording.previewUrl && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: isMaximized ? "45%" : "340px", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="border-r border-white/5 bg-black/40 flex flex-col h-full relative"
              id="reader-original-preview-panel"
            >
              <div className="absolute top-4 left-4 z-10 px-2 py-1 rounded bg-black/80 backdrop-blur border border-white/10 text-[10px] font-mono text-zinc-400 flex items-center gap-1">
                <ImageIcon className="w-3 h-3 text-teal-400" /> Original Document Page
              </div>
              <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
                <div className="max-w-full max-h-full rounded-lg overflow-hidden border border-white/10 shadow-lg bg-zinc-950/60 p-2">
                  <img
                    src={recording.previewUrl}
                    alt="Original Book Page screenshot"
                    className="max-w-full max-h-[340px] object-contain rounded"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Right Side: Paginated E-Reader Text View with highlights */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-10 font-serif leading-relaxed text-zinc-300 h-full relative bg-radial from-[#0e0e11] to-[#070708] scroll-smooth">
          <div className="max-w-2xl mx-auto space-y-6 pb-12">
            {isBookMode && (
              <div className="border-b border-white/5 pb-4 mb-6 flex justify-between items-center text-zinc-500 font-sans text-xs">
                <span>SECTION {currentSectionIndex + 1} OF {sections.length}</span>
                <span className="font-mono">{sections[currentSectionIndex].length} characters</span>
              </div>
            )}

            {readerNotice && (
              <div className={`rounded-xl p-4 flex items-start gap-3 text-xs mb-6 font-sans relative border ${
                readerNotice.type === "success"
                  ? "bg-emerald-950/10 border-emerald-500/20 text-emerald-200"
                  : readerNotice.type === "error"
                    ? "bg-red-950/10 border-red-500/20 text-red-200"
                    : "bg-amber-950/10 border-amber-500/20 text-amber-200"
              }`}>
                <Sparkles className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                  readerNotice.type === "success" ? "text-emerald-400" : readerNotice.type === "error" ? "text-red-400" : "text-amber-400 animate-pulse"
                }`} />
                <div className="space-y-1 pr-6 flex-1">
                  <p className="font-semibold">{readerNotice.type === "success" ? "Operation Successful" : readerNotice.type === "error" ? "Operation Failed" : "Browser Offline Speech Fallback Active"}</p>
                  <p className="opacity-90 leading-relaxed">{readerNotice.message}</p>
                </div>
                <button
                  onClick={() => setReaderNotice(null)}
                  className="absolute top-3 right-3 text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {tokens.length === 0 ? (
              <p className="text-center text-zinc-500 font-sans py-12">No text content available.</p>
            ) : (
              <div className="text-lg md:text-xl tracking-wide leading-relaxed font-serif text-zinc-300 selection:bg-teal-500/30 selection:text-teal-200">
                {tokens.map((token, idx) => {
                  if (!token.isWord) {
                    return <span key={idx} className="whitespace-pre-wrap">{token.text}</span>;
                  }
                  const isActive = idx === activeTokenIndex;
                  return (
                    <span
                      key={idx}
                      onClick={() => handleWordClick(token.startChar, token.virtualStart)}
                      className={`inline cursor-pointer rounded px-0.5 transition-all duration-150 border border-transparent ${
                        isActive
                          ? "bg-teal-400 text-black font-semibold shadow-[0_0_8px_rgba(45,212,191,0.4)]"
                          : "hover:bg-white/10 hover:text-white"
                      }`}
                      style={{ contentVisibility: "auto" }}
                    >
                      {token.text}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Controls & Player */}
      <div className="h-16 bg-[#08080a] border-t border-white/5 px-6 flex items-center justify-between z-10">
        {/* Playback Speed Controls */}
        <div className="flex items-center gap-4 w-1/4">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-teal-400" />
            <span className="text-xs text-zinc-400 font-mono">
              {formatTime(activeCurrentTime)} / {formatTime(activeDuration)}
            </span>
          </div>

          {isBookMode && (
            <div className="hidden sm:flex items-center gap-1 border border-white/10 rounded-lg p-0.5 bg-black/40">
              {[1.0, 1.25, 1.5, 1.75].map((sp) => (
                <button
                  key={sp}
                  onClick={() => handlePlaybackSpeedChange(sp)}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono transition-colors ${
                    playbackSpeed === sp
                      ? "bg-teal-500 text-black"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {sp}x
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Player Main Controls */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleSkipBack}
            disabled={isBookMode && currentSectionIndex === 0 && activeCurrentTime <= 5}
            className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-zinc-400 hover:text-white transition-colors disabled:opacity-30 disabled:pointer-events-none"
            title={isBookMode ? "Skip back 5s / Previous Section" : "Skip back 5s"}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            onClick={handlePlayPauseToggle}
            className="w-11 h-11 rounded-full bg-white text-black hover:scale-105 active:scale-95 flex items-center justify-center transition-all shadow-md shadow-white/5"
            title={isCurrentlyPlaying ? "Pause Narration" : "Resume Narration"}
          >
            {isCurrentlyPlaying ? <Pause className="w-5 h-5 fill-black" /> : <Play className="w-5 h-5 fill-black ml-0.5" />}
          </button>

          <button
            onClick={handleSkipForward}
            disabled={isBookMode && currentSectionIndex === sections.length - 1 && activeDuration - activeCurrentTime <= 5}
            className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-zinc-400 hover:text-white transition-colors disabled:opacity-30 disabled:pointer-events-none"
            title={isBookMode ? "Skip forward 5s / Next Section" : "Skip forward 5s"}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Active section and reading percentage metrics */}
        <div className="w-1/4 flex flex-col items-end gap-1">
          <div className="text-[10px] text-zinc-500 font-mono flex items-center gap-2">
            {isBookMode && sections.length > 1 && (
              <span className="text-teal-400 font-semibold bg-teal-500/10 px-1.5 py-0.5 rounded border border-teal-500/10">
                Sec {currentSectionIndex + 1} of {sections.length}
              </span>
            )}
            <span>
              {activeDuration > 0 ? `${Math.round((activeCurrentTime / activeDuration) * 100)}% read` : "0% read"}
            </span>
          </div>
          <div className="w-28 h-1 bg-zinc-900 rounded-full overflow-hidden border border-white/5">
            <div
              className="h-full bg-teal-500 transition-all duration-300 animate-pulse"
              style={{
                width: `${activeDuration > 0 ? (activeCurrentTime / activeDuration) * 100 : 0}%`
              }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
};
