/**
 * Splits a long text (like a full book or long document) into clean, readable sections.
 * It prioritizes splitting by clear chapter markers, then by double line breaks (paragraphs),
 * and finally falls back to sentence or character limits to ensure each section is roughly
 * 4000-8000 characters (optimal for quick, reliable Gemini TTS generation).
 */
export function splitTextIntoSections(text: string, targetLength: number = 6000): string[] {
  if (!text) return [];
  if (text.length <= targetLength) return [text];

  // 1. Attempt to split by clear chapter markers (e.g., "Chapter 1", "CHAPTER II", "Act I", etc.)
  const chapterRegex = /\n+(?=Chapter\s+\d+|CHAPTER\s+[IVXLCDM]+|Chapter\s+[IVXLCDM]+|Chapter\s+[a-zA-Z]+|\bSection\s+\d+\b)/gi;
  const chapterSplits = text.split(chapterRegex).map(s => s.trim()).filter(Boolean);
  
  if (chapterSplits.length > 1) {
    // If chapters are too long, split them further using paragraphs
    const finalSections: string[] = [];
    for (const chap of chapterSplits) {
      if (chap.length <= targetLength * 1.5) {
        finalSections.push(chap);
      } else {
        finalSections.push(...splitByParagraphs(chap, targetLength));
      }
    }
    return finalSections;
  }

  // 2. Fall back to splitting by paragraphs (double newlines)
  return splitByParagraphs(text, targetLength);
}

function splitByParagraphs(text: string, targetLength: number): string[] {
  const paragraphs = text.split(/\n\s*\n+/);
  const sections: string[] = [];
  let currentSection = "";

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    if (currentSection && (currentSection.length + trimmed.length > targetLength)) {
      sections.push(currentSection.trim());
      currentSection = trimmed;
    } else {
      currentSection = currentSection ? currentSection + "\n\n" + trimmed : trimmed;
    }
  }

  if (currentSection.trim()) {
    sections.push(currentSection.trim());
  }

  // Fallback: if we still have sections that are extremely long, split by sentences
  const finalSections: string[] = [];
  for (const sec of sections) {
    if (sec.length <= targetLength * 1.5) {
      finalSections.push(sec);
    } else {
      finalSections.push(...splitBySentences(sec, targetLength));
    }
  }

  return finalSections;
}

function splitBySentences(text: string, targetLength: number): string[] {
  // Split on sentence endings (. ! ?) but keep them
  const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)/g) || [text];
  const sections: string[] = [];
  let currentSection = "";

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    if (currentSection && (currentSection.length + trimmed.length > targetLength)) {
      sections.push(currentSection.trim());
      currentSection = trimmed;
    } else {
      currentSection = currentSection ? currentSection + " " + trimmed : trimmed;
    }
  }

  if (currentSection.trim()) {
    sections.push(currentSection.trim());
  }

  return sections;
}
