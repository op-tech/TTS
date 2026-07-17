import express from "express";
import path from "path";
import fs from "fs";
import os from "os";
import { exec } from "child_process";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { PDFParse } from "pdf-parse";

dotenv.config();

const PORT = 3000;

let aiClient: GoogleGenAI | null = null;
let cachedApiKey: string | undefined = undefined;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not defined. Please add it to Secrets/Settings.");
  }
  if (!aiClient || cachedApiKey !== apiKey) {
    cachedApiKey = apiKey;
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// Prepend 44-byte WAV header to raw 16-bit mono PCM data (24kHz is default for Gemini TTS)
function addWavHeader(pcmBuffer: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  /* RIFF identifier */
  header.write("RIFF", 0);
  /* file length */
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  /* RIFF type */
  header.write("WAVE", 8);
  /* format chunk identifier */
  header.write("fmt ", 12);
  /* format chunk length */
  header.writeUInt32LE(16, 16);
  /* sample format (PCM = 1) */
  header.writeUInt16LE(1, 20);
  /* channel count (1) */
  header.writeUInt16LE(1, 22);
  /* sample rate */
  header.writeUInt32LE(sampleRate, 24);
  /* byte rate (sampleRate * channels * bytesPerSample) => sampleRate * 1 * 2 */
  header.writeUInt32LE(sampleRate * 2, 28);
  /* block align (channels * bytesPerSample) => 1 * 2 */
  header.writeUInt16LE(2, 32);
  /* bits per sample (16-bit) */
  header.writeUInt16LE(16, 34);
  /* data chunk identifier */
  header.write("data", 36);
  /* data chunk length */
  header.writeUInt32LE(pcmBuffer.length, 40);

  return Buffer.concat([header, pcmBuffer]);
}

// Transcode raw WAV buffer to target format and speed using ffmpeg
async function transcodeAudio(
  wavBuffer: Buffer,
  format: "mp3" | "wav" | "aac",
  speed: number = 1.0
): Promise<Buffer> {
  const tempId = Math.random().toString(36).slice(2, 10);
  const tempDir = os.tmpdir();
  const inputPath = path.join(tempDir, `input_${tempId}.wav`);
  const outputPath = path.join(tempDir, `output_${tempId}.${format}`);

  await fs.promises.writeFile(inputPath, wavBuffer);

  try {
    // Apply dynamic audio normalizer to prevent fading/drops over long segments
    const filters = ["dynaudnorm"];
    if (speed !== 1.0) {
      // Clamp speed between 0.5 and 2.0 (ffmpeg's atempo filter bounds)
      const clampedSpeed = Math.max(0.5, Math.min(2.0, speed));
      filters.push(`atempo=${clampedSpeed}`);
    }
    const filter = `-filter:a "${filters.join(",")}"`;

    let codec = "";
    if (format === "mp3") {
      codec = "-codec:a libmp3lame -qscale:a 2";
    } else if (format === "aac") {
      codec = "-codec:a aac -b:a 128k";
    } else if (format === "wav") {
      codec = "-codec:a pcm_s16le";
    }

    const command = `/usr/bin/ffmpeg -y -i "${inputPath}" ${filter} ${codec} "${outputPath}"`;

    await new Promise<void>((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`ffmpeg failed: ${error.message}\nstderr: ${stderr}`));
        } else {
          resolve();
        }
      });
    });

    const outputBuffer = await fs.promises.readFile(outputPath);
    return outputBuffer;
  } finally {
    // Clean up temporary files
    fs.promises.unlink(inputPath).catch(() => {});
    fs.promises.unlink(outputPath).catch(() => {});
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API: Analyze text for implied speaker's gender and emotional tone
  app.post("/api/tts/analyze", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text || typeof text !== "string" || text.trim() === "") {
        res.status(400).json({ error: "Text is required for analysis." });
        return;
      }

      const ai = getGeminiClient();
      let result;

      try {
        const response = await retryWithBackoff(async () => {
          return await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: `Analyze the following text. Determine the implied gender of the speaker (male or female).
        
Text to analyze:
"${text.slice(0, 1000)}"`,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  gender: {
                    type: Type.STRING,
                    description: "The implied speaker's gender: 'male' or 'female'",
                  },
                  confidence: {
                    type: Type.NUMBER,
                    description: "Confidence score from 0.0 to 1.0",
                  },
                  explanation: {
                    type: Type.STRING,
                    description: "A brief one-sentence explanation of the choice",
                  },
                },
                required: ["gender", "confidence", "explanation"],
              },
            },
          });
        }, 3, 1000);

        const jsonText = response.text?.trim() || "{}";
        result = JSON.parse(jsonText);
      } catch (innerError: any) {
        console.warn("Analysis failed (using robust fallback default parameters):", innerError?.message || innerError);
        result = {
          gender: "female",
          confidence: 0.5,
          explanation: "Fallback active: defaulted to female due to server capacity limits or quota limitations."
        };
      }

      res.json(result);
    } catch (error: any) {
      console.error("Critical error in analysis endpoint:", error);
      res.json({
        gender: "female",
        confidence: 0.5,
        explanation: "Fallback applied due to an unexpected server exception."
      });
    }
  });

function chunkText(text: string, maxChunkLength: number = 12000): string[] {
  // Split on punctuation, line breaks or other natural boundaries
  const sentences = text.match(/[^.!?\n\r]+[.!?\n\r]*|[\n\r]+/g) || [text];
  const chunks: string[] = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxChunkLength) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }
      
      // If a single sentence is longer than maxChunkLength, split it by spaces
      if (sentence.length > maxChunkLength) {
        const words = sentence.split(/\s+/);
        let wordChunk = "";
        for (const word of words) {
          if ((wordChunk + " " + word).length > maxChunkLength) {
            if (wordChunk.trim()) {
              chunks.push(wordChunk.trim());
            }
            wordChunk = word;
          } else {
            wordChunk = wordChunk ? wordChunk + " " + word : word;
          }
        }
        if (wordChunk.trim()) {
          currentChunk = wordChunk;
        }
      } else {
        currentChunk = sentence;
      }
    } else {
      currentChunk += sentence;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries: number = 6,
  delay: number = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const errorStr = String(error?.message || error || "").toLowerCase();
    
    // If we've reached a daily/billing limit, retrying in seconds will never help
    const isDailyQuotaOrBilling =
      errorStr.includes("generaterequestsperday") ||
      errorStr.includes("per day") ||
      errorStr.includes("perday") ||
      errorStr.includes("billing") ||
      errorStr.includes("daily") ||
      errorStr.includes("billing details") ||
      errorStr.includes("plan");

    const isRateLimitOrDemandSpike =
      !isDailyQuotaOrBilling && (
        error?.status === 429 ||
        error?.status === 503 ||
        error?.statusCode === 429 ||
        error?.statusCode === 503 ||
        errorStr.includes("429") ||
        errorStr.includes("503") ||
        errorStr.includes("resource_exhausted") ||
        errorStr.includes("quota") ||
        errorStr.includes("too many requests") ||
        errorStr.includes("limit exceeded") ||
        errorStr.includes("unavailable") ||
        errorStr.includes("high demand") ||
        errorStr.includes("overloaded") ||
        errorStr.includes("spikes in demand")
      );

    if (retries > 0 && isRateLimitOrDemandSpike) {
      console.warn(`Gemini service/rate limit issue encountered. Retrying in ${delay}ms... (${retries} retries left). Error: ${error?.message || error}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      const nextDelay = delay * 2 + Math.floor(Math.random() * 500);
      return retryWithBackoff(fn, retries - 1, nextDelay);
    }
    throw error;
  }
}

async function runWithControlledConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number = 2
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < tasks.length) {
      const index = currentIndex++;
      if (index >= tasks.length) break;
      const task = tasks[index];
      results[index] = await task();
      // Only delay slightly between tasks if there are more tasks in the queue
      if (currentIndex < tasks.length) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

async function batchPromises<T>(
  tasks: (() => Promise<T>)[],
  batchSize: number = 3
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(task => task()));
    results.push(...batchResults);
  }
  return results;
}

  // API: Generate Text-To-Speech audio
  app.post("/api/tts/generate", async (req, res) => {
    try {
      const { text, voiceName, language, speed, format, mode } = req.body;

      if (!text || typeof text !== "string" || text.trim() === "") {
        res.status(400).json({ error: "Text is required for TTS generation." });
        return;
      }

      const ai = getGeminiClient();

      let baseVoice = "Kore";
      switch (voiceName) {
        case "Elena": baseVoice = "Aoede"; break;
        case "Sophia": baseVoice = "Kore"; break;
        case "Isabella": baseVoice = "Aoede"; break;
        case "Maya": baseVoice = "Kore"; break;
        case "Marcus": baseVoice = "Charon"; break;
        case "Elias": baseVoice = "Fenrir"; break;
        case "Nathaniel": baseVoice = "Charon"; break;
        case "Leo": baseVoice = "Puck"; break;
        default: baseVoice = "Kore"; break;
      }

      console.log(`TTS Request -> Voice: ${voiceName || "Kore"} (Mapped: ${baseVoice}), Language: ${language}, Mode: ${mode || "narration"}, Format: ${format || "mp3"}, Speed: ${speed || 1.0}`);

      // Chunk the text to support unlimited words and avoid Gemini TTS errors on long texts
      const chunks = chunkText(text, 4000).filter(c => c.trim().length > 0);
      if (chunks.length === 0) {
        throw new Error("Text is empty or contains only whitespace.");
      }
      console.log(`Processing ${chunks.length} chunks for Text-To-Speech...`);

      const tasks = chunks.map((chunk, index) => {
        return async () => {
          const prompt = chunk;
          
          return retryWithBackoff(async () => {
            const response = await ai.models.generateContent({
              model: "gemini-3.1-flash-tts-preview",
              contents: [{ parts: [{ text: prompt }] }],
              config: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: {
                      voiceName: baseVoice, // Used mapped voice
                    },
                  },
                },
              },
            });

            const parts = response.candidates?.[0]?.content?.parts || [];
            const audioPart = parts.find(p => p.inlineData && p.inlineData.mimeType?.startsWith('audio/'));
            const base64Audio = audioPart?.inlineData?.data;
            if (!base64Audio) {
              console.error("Gemini TTS response parts:", JSON.stringify(parts, null, 2));
              throw new Error(`No audio data returned from Gemini TTS model for chunk ${index + 1}.`);
            }

            return Buffer.from(base64Audio, "base64");
          });
        };
      });

      // Run chunk generations concurrently with backoff retry to guarantee success without hitting rate limits
      const pcmBuffers = await runWithControlledConcurrency(tasks, 2);
      const combinedPcm = Buffer.concat(pcmBuffers);

      // Wrap combined raw PCM 24000Hz 16-bit Mono into WAV
      const wavBuffer = addWavHeader(combinedPcm, 24000);

      // Transcode using ffmpeg for custom speed and format (MP3, WAV, AAC)
      const targetFormat = format || "mp3";
      const targetSpeed = typeof speed === "number" ? speed : 1.0;
      
      const transcodedBuffer = await transcodeAudio(wavBuffer, targetFormat, targetSpeed);

      // Set headers and send file
      let contentType = "audio/mpeg";
      if (targetFormat === "wav") contentType = "audio/wav";
      if (targetFormat === "aac") contentType = "audio/aac";

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="speech.${targetFormat}"`);
      res.send(transcodedBuffer);
    } catch (error: any) {
      console.error("Generation error:", error);
      res.status(500).json({ error: error.message || "Failed to generate TTS audio." });
    }
  });

  // API: Transcode an existing audio blob (sent as base64) to another format/speed
  app.post("/api/tts/transcode", async (req, res) => {
    try {
      const { base64Audio, format, speed } = req.body;
      if (!base64Audio) {
        res.status(400).json({ error: "base64Audio is required for transcoding." });
        return;
      }

      const rawBuffer = Buffer.from(base64Audio, "base64");
      
      // Treat as WAV if it starts with RIFF, otherwise prepend WAV header (assuming 24000 PCM from original)
      let wavBuffer: Buffer;
      if (rawBuffer.slice(0, 4).toString() === "RIFF") {
        wavBuffer = rawBuffer;
      } else {
        wavBuffer = addWavHeader(rawBuffer, 24000);
      }

      const targetFormat = format || "mp3";
      const targetSpeed = typeof speed === "number" ? speed : 1.0;

      const transcodedBuffer = await transcodeAudio(wavBuffer, targetFormat, targetSpeed);

      let contentType = "audio/mpeg";
      if (targetFormat === "wav") contentType = "audio/wav";
      if (targetFormat === "aac") contentType = "audio/aac";

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="speech.${targetFormat}"`);
      res.send(transcodedBuffer);
    } catch (error: any) {
      console.error("Transcode error:", error);
      res.status(500).json({ error: error.message || "Failed to transcode audio." });
    }
  });

  // API: Extract text from PDF or screenshot (image)
  app.post("/api/tts/extract-text", async (req, res) => {
    try {
      const { fileBase64, mimeType } = req.body;
      if (!fileBase64) {
        res.status(400).json({ error: "fileBase64 is required for text extraction." });
        return;
      }
      if (!mimeType) {
        res.status(400).json({ error: "mimeType is required." });
        return;
      }

      let text = "";

      if (mimeType === "application/pdf") {
        console.log("Using native PDF parser to extract full book contents...");
        const pdfBuffer = Buffer.from(fileBase64, "base64");
        const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
        const parsedData = await parser.getText();
        let rawText = parsedData.text || "";
        
        // Smart cleanup for PDF: remove page numbers and headers/footers
        let lines = rawText.split('\n');
        lines = lines.filter(line => {
          const trimmed = line.trim();
          if (!trimmed) return true; // keep empty lines for structure
          
          // Filter out pure numbers (typically page numbers)
          if (/^\d+$/.test(trimmed)) return false;
          
          // Filter out common page number formats: "Page X", "Page X of Y", "- X -", "X / Y"
          if (/^(page\s*\d+(?:\s*of\s*\d+)?|\d+\s*\/\s*\d+|-\s*\d+\s*-)$/i.test(trimmed)) return false;
          
          // Filter out lines that look like typical short headers with numbers (e.g., Chapter 1, but keep the chapter if it's the only thing... actually let's keep chapters, only drop clear page artifacts)
          
          return true;
        });
        
        // Condense excessive newlines
        text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
        
      } else {
        console.log("Using Gemini model for image OCR extraction...");
        const ai = getGeminiClient();

        const filePart = {
          inlineData: {
            mimeType,
            data: fileBase64,
          },
        };

        const textPart = {
          text: "Intelligently extract all readable text from this file. You MUST completely EXCLUDE all page numbers, headers, footers, watermarks, and other useless metadata. Retain paragraphs, lists, layout, and the main structure of the actual content. Do NOT add any conversational introduction, greetings, explanations, or commentary. Simply output the exact cleaned text from the document.",
        };

        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: { parts: [filePart, textPart] },
        });

        text = response.text || "";
      }

      res.json({ text });
    } catch (error: any) {
      console.error("Text extraction error:", error);
      res.status(500).json({ error: error.message || "Failed to extract text from file." });
    }
  });

  // Vite Integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
