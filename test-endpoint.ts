import { GoogleGenAI } from "@google/genai";
import 'dotenv/config';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function run() {
  const voices = ["Aoede", "Kore", "Charon", "Fenrir", "Puck"];
  for (const voice of voices) {
    try {
      console.log(`Testing voice: ${voice}`);
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: "Hello! This is a test of the text to speech system." }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: voice,
              },
            },
          },
        },
      });

      const parts = response.candidates?.[0]?.content?.parts || [];
      const audioPart = parts.find(p => p.inlineData && p.inlineData.mimeType?.startsWith('audio/'));
      const base64Audio = audioPart?.inlineData?.data;
      if (!base64Audio) {
        console.error(`Failed for voice ${voice}. Parts:`, JSON.stringify(parts, null, 2));
      } else {
        console.log(`Success for voice ${voice}! Audio bytes: ${base64Audio.length}`);
      }
    } catch (err: any) {
      console.error(`Error for voice ${voice}:`, err.message || err);
    }
  }
}

run().catch(console.error);
