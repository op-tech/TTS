import { motion } from "motion/react";
import { Speech, History, Sparkles } from "lucide-react";

interface MainHeaderProps {
  activeTab: "synth" | "history";
  setActiveTab: (tab: "synth" | "history") => void;
  historyCount: number;
}

export default function MainHeader({
  activeTab,
  setActiveTab,
  historyCount
}: MainHeaderProps) {
  return (
    <header className="space-y-6" id="main-header">
      {/* Brand & Decorative Border */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <div className="bg-white/5 p-2 rounded-xl text-white flex items-center justify-center border border-white/10">
              <Speech className="w-5 h-5" />
            </div>
            <h1 className="text-3xl text-white tracking-tight font-serif italic" style={{ fontFamily: "'Georgia', 'Playfair Display', serif" }}>
              Vocalise AI
              <span className="text-[10px] uppercase tracking-[0.2em] font-sans font-bold text-[#71717a] ml-4 not-italic align-middle">
                Converter Engine
              </span>
            </h1>
          </div>
          <p className="text-xs text-[#a1a1aa] max-w-xl leading-relaxed">
            Generate and export custom voice recordings with language translation, adjustable playback speed, and on-the-fly transcoding.
          </p>
        </div>

        {/* Decorative metadata indicator (Sophisticated Dark layout choices) */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-white/10">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse"></div>
            <span className="text-xs font-medium text-[#d4d4d8]">Smart Detection Active</span>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-[10px] text-[#71717a] font-mono uppercase tracking-[0.1em]">
            <span>FFmpeg Native</span>
          </div>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b border-white/5" id="header-tabs">
        <button
          id="tab-btn-synth"
          onClick={() => setActiveTab("synth")}
          className="relative py-3 px-6 text-xs uppercase tracking-[0.15em] font-semibold focus:outline-none transition-colors flex items-center gap-2 select-none"
        >
          <Sparkles className={`w-3.5 h-3.5 ${activeTab === "synth" ? "text-white" : "text-zinc-500"}`} />
          <span className={activeTab === "synth" ? "text-white font-bold" : "text-zinc-400 hover:text-zinc-300"}>
            Synthesizer
          </span>
          {activeTab === "synth" && (
            <motion.div
              layoutId="active-tab-indicator"
              className="absolute bottom-0 left-0 right-0 h-[2px] bg-white"
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            />
          )}
        </button>

        <button
          id="tab-btn-history"
          onClick={() => setActiveTab("history")}
          className="relative py-3 px-6 text-xs uppercase tracking-[0.15em] font-semibold focus:outline-none transition-colors flex items-center gap-2 select-none"
        >
          <History className={`w-3.5 h-3.5 ${activeTab === "history" ? "text-white" : "text-zinc-500"}`} />
          <span className={activeTab === "history" ? "text-white font-bold" : "text-zinc-400 hover:text-zinc-300"}>
            Saved Recordings
          </span>
          {historyCount > 0 && (
            <span className="text-[10px] bg-white/10 border border-white/10 text-white h-5 px-1.5 rounded-full flex items-center justify-center font-mono font-bold">
              {historyCount}
            </span>
          )}
          {activeTab === "history" && (
            <motion.div
              layoutId="active-tab-indicator"
              className="absolute bottom-0 left-0 right-0 h-[2px] bg-white"
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            />
          )}
        </button>
      </div>
    </header>
  );
}
