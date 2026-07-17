import { GoogleGenAI } from "@google/genai";
import 'dotenv/config';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-tts-preview",
    contents: "Hello world!",
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: "Aoede",
          },
        },
      },
    },
  });
  console.log(response.candidates?.[0]?.content?.parts?.[0] ? Object.keys(response.candidates?.[0]?.content?.parts?.[0]) : response.candidates?.[0]?.content?.parts);
  if (response.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
      console.log('has inlineData', !!response.candidates?.[0]?.content?.parts?.[0]?.inlineData.data);
  }
}
run().catch(console.error);
