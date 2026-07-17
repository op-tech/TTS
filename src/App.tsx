import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import MainHeader from "./components/MainHeader";
import SynthesizerTab from "./components/SynthesizerTab";
import HistoryTab from "./components/HistoryTab";
import { Recording, Category } from "./types";
import { saveAudioBlob, deleteAudioBlob, openDB } from "./lib/db";

const LOCAL_STORAGE_KEY = "tts_recordings_meta";
const LOCAL_STORAGE_KEY_CATEGORIES = "tts_recordings_categories";

const DEFAULT_CATEGORIES: Category[] = [
  { id: "cat-narrations", name: "Narrations", createdAt: 1718000000000 },
  { id: "cat-work", name: "Work & Reports", createdAt: 1718000001000 },
  { id: "cat-personal", name: "Personal", createdAt: 1718000002000 }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<"synth" | "history">("synth");
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  // Load saved recordings and categories on mount
  useEffect(() => {
    const savedMeta = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedMeta) {
      try {
        setRecordings(JSON.parse(savedMeta));
      } catch (err) {
        console.error("Failed to parse saved recordings metadata:", err);
      }
    }

    const savedCategories = localStorage.getItem(LOCAL_STORAGE_KEY_CATEGORIES);
    if (savedCategories) {
      try {
        setCategories(JSON.parse(savedCategories));
      } catch (err) {
        console.error("Failed to parse saved categories:", err);
        setCategories(DEFAULT_CATEGORIES);
      }
    } else {
      setCategories(DEFAULT_CATEGORIES);
      localStorage.setItem(LOCAL_STORAGE_KEY_CATEGORIES, JSON.stringify(DEFAULT_CATEGORIES));
    }
  }, []);

  // Save a new recording metadata and write blob to IndexedDB
  const handleSaveRecording = async (recording: Recording, audioBlob: Blob) => {
    // 1. Save Blob into IndexedDB
    await saveAudioBlob(recording.id, audioBlob);

    // 2. Save metadata into localStorage and state
    const updatedRecordings = [recording, ...recordings];
    setRecordings(updatedRecordings);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedRecordings));
  };

  // Update a recording's metadata (e.g. rename or assign folder)
  const handleUpdateRecording = (id: string, updates: Partial<Recording>) => {
    const updated = recordings.map((rec) => (rec.id === id ? { ...rec, ...updates } : rec));
    setRecordings(updated);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  };

  // Create a new category/folder
  const handleCreateCategory = (name: string) => {
    const newCategory: Category = {
      id: Math.random().toString(36).slice(2, 11),
      name,
      createdAt: Date.now()
    };
    const updated = [...categories, newCategory];
    setCategories(updated);
    localStorage.setItem(LOCAL_STORAGE_KEY_CATEGORIES, JSON.stringify(updated));
    return newCategory;
  };

  // Rename an existing category/folder
  const handleRenameCategory = (id: string, newName: string) => {
    const updated = categories.map((cat) => (cat.id === id ? { ...cat, name: newName } : cat));
    setCategories(updated);
    localStorage.setItem(LOCAL_STORAGE_KEY_CATEGORIES, JSON.stringify(updated));
  };

  // Delete a category/folder and dissociate recordings inside it
  const handleDeleteCategory = (id: string) => {
    const updatedCategories = categories.filter((cat) => cat.id !== id);
    setCategories(updatedCategories);
    localStorage.setItem(LOCAL_STORAGE_KEY_CATEGORIES, JSON.stringify(updatedCategories));

    // Dissociate recordings
    const updatedRecordings = recordings.map((rec) =>
      rec.categoryId === id ? { ...rec, categoryId: undefined } : rec
    );
    setRecordings(updatedRecordings);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedRecordings));
  };

  // Delete a recording from both local storage metadata and IndexedDB
  const handleDeleteRecording = async (id: string) => {
    // 1. Delete Blob from IndexedDB
    await deleteAudioBlob(id);

    // Also delete any associated split book section audio blobs from IndexedDB
    for (let i = 0; i < 200; i++) {
      await deleteAudioBlob(`${id}_sec_${i}`);
    }

    // 2. Delete metadata from localStorage and state
    const updatedRecordings = recordings.filter((rec) => rec.id !== id);
    setRecordings(updatedRecordings);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedRecordings));
  };

  // Purge all records from both localStorage metadata and IndexedDB store
  const handleClearAll = async () => {
    // 1. Clear IndexedDB Store
    try {
      const db = await openDB();
      const transaction = db.transaction("audio_blobs", "readwrite");
      const store = transaction.objectStore("audio_blobs");
      const request = store.clear();
      await new Promise<void>((resolve, reject) => {
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      console.error("Failed to clear IndexedDB audio blobs:", err);
    }

    // 2. Clear localStorage and state
    setRecordings([]);
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-teal-500/30 selection:text-teal-200">
      {/* Decorative ambient background glows */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-teal-500/5 rounded-full filter blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-emerald-500/5 rounded-full filter blur-[120px] pointer-events-none" />

      {/* Main Container */}
      <div className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-8 z-10">
        {/* Navigation and Logo Header */}
        <MainHeader
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          historyCount={recordings.length}
        />

        {/* Tab content transitions */}
        <main className="min-h-[500px]" id="tab-content-wrapper">
          <AnimatePresence mode="wait">
            {activeTab === "synth" ? (
              <motion.div
                key="synthesizer-tab"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <SynthesizerTab
                  categories={categories}
                  onCreateCategory={handleCreateCategory}
                  onSaveRecording={handleSaveRecording}
                />
              </motion.div>
            ) : (
              <motion.div
                key="history-tab"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <HistoryTab
                  recordings={recordings}
                  categories={categories}
                  onDeleteRecording={handleDeleteRecording}
                  onClearAll={handleClearAll}
                  onCreateCategory={handleCreateCategory}
                  onRenameCategory={handleRenameCategory}
                  onDeleteCategory={handleDeleteCategory}
                  onUpdateRecording={handleUpdateRecording}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Humble, clean footer */}
      <footer className="border-t border-zinc-900 py-6 text-center text-zinc-600 text-xs">
        <p>&copy; {new Date().getFullYear()} Google AI Studio Build &bull; High Fidelity Synthesizer Panel</p>
      </footer>
    </div>
  );
}
