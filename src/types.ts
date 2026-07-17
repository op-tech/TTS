export interface Category {
  id: string;
  name: string;
  createdAt: number;
}

export interface Recording {
  id: string;
  title?: string; // Custom name given by the user
  categoryId?: string; // Associated folder/category ID
  text: string;
  timestamp: number;
  voiceName: string;
  gender: "male" | "female";
  language: string;
  speed: number;
  format: "mp3" | "wav" | "aac";
  duration?: number;
  lastPosition?: number;
  previewUrl?: string; // Saved data URL for image or PDF preview reference
  fileName?: string;   // Original name of the uploaded document or screenshot
  fileType?: string;   // MIME type of the uploaded file
  mode?: "narration" | "browser-speech";
}

export interface AnalysisResult {
  gender: "male" | "female";
  confidence: number;
  explanation: string;
}

export interface VoiceOption {
  id: string;
  name: string;
  gender: "male" | "female";
  description: string;
  characteristics: string[];
}

export interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}

export const VOICES: VoiceOption[] = [
  // Female Storytellers
  { id: "Elena", name: "Elena", gender: "female", description: "Warm, incredibly human, expressive, and captivating classic narrator. Perfect for deep emotional resonance.", characteristics: ["Warm", "Human", "Captivating"] },
  { id: "Sophia", name: "Sophia", gender: "female", description: "Award-winning nurturing storyteller. Deeply human with natural rhythm and gentle inflections.", characteristics: ["Nurturing", "Comforting", "Natural"] },
  { id: "Isabella", name: "Isabella", gender: "female", description: "Crisp, dynamic, and highly articulate professional narrator. Features subtle breath sounds and realistic emphasis.", characteristics: ["Articulate", "Dynamic", "Realistic"] },
  { id: "Maya", name: "Maya", gender: "female", description: "Deeply empathetic and expressive narrator. Intimate, rich, and remarkably human conversational storytelling.", characteristics: ["Empathetic", "Expressive", "Intimate"] },

  // Male Storytellers
  { id: "Marcus", name: "Marcus", gender: "male", description: "Veteran narrator with a deep, resonant, and exceptionally human baritone voice. Grounded and emotionally rich.", characteristics: ["Deep", "Resonant", "Grounded"] },
  { id: "Elias", name: "Elias", gender: "male", description: "Masterful storyteller with a smooth, velvety, and deeply human voice. Warm, intimate, and comforting pacing.", characteristics: ["Smooth", "Warm", "Intimate"] },
  { id: "Nathaniel", name: "Nathaniel", gender: "male", description: "Acclaimed voice actor with a character-rich, textured, and profoundly human narration. Deep emotional intelligence.", characteristics: ["Character-rich", "Seasoned", "Expressive"] },
  { id: "Leo", name: "Leo", gender: "male", description: "Dynamic and engaging professional narrator. Bright, clear, and full of natural human energy and perfect pacing.", characteristics: ["Bright", "Engaging", "Energetic"] },
];

export const LANGUAGES: LanguageOption[] = [
  { code: "en", name: "English", nativeName: "English", flag: "🇺🇸" },
  { code: "es", name: "Spanish", nativeName: "Español", flag: "🇪🇸" },
  { code: "fr", name: "French", nativeName: "Français", flag: "🇫🇷" },
  { code: "de", name: "German", nativeName: "Deutsch", flag: "🇩🇪" },
  { code: "it", name: "Italian", nativeName: "Italiano", flag: "🇮🇹" },
  { code: "pt", name: "Portuguese", nativeName: "Português", flag: "🇵🇹" },
  { code: "ja", name: "Japanese", nativeName: "日本語", flag: "🇯🇵" },
  { code: "zh", name: "Chinese", nativeName: "中文", flag: "🇨🇳" },
  { code: "ko", name: "Korean", nativeName: "한국어", flag: "🇰🇷" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", flag: "🇮🇳" },
  { code: "ar", name: "Arabic", nativeName: "العربية", flag: "🇸🇦" },
  { code: "ru", name: "Russian", nativeName: "Русский", flag: "🇷🇺" },
];
