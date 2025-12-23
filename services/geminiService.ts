
import { GoogleGenAI, Modality, Type } from "@google/genai";

// Use process.env.API_KEY directly as per guidelines.
const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY as string });

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export const geminiService = {
  async generateStory(prompt: string) {
    const ai = getAI();
    try {
      // Using gemini-3-pro-preview for complex storytelling tasks as recommended.
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Create an immersive and cinematic short story (300-400 words) based on: "${prompt}". 
        Include a compelling title and a short one-sentence hook.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              author: { type: Type.STRING },
              content: { type: Type.STRING },
              description: { type: Type.STRING }
            },
            required: ["title", "author", "content", "description"]
          }
        }
      });
      // Access text property directly.
      return JSON.parse(response.text || '{}');
    } catch (error) {
      console.error("Story generation error:", error);
      throw error;
    }
  },

  async generateTTS(text: string, voice: string = 'Kore') {
    const ai = getAI();
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Narrate this story with expression and clarity: ${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) throw new Error("No audio data received from Gemini TTS");
      return base64Audio;
    } catch (error) {
      console.error("TTS generation error:", error);
      throw error;
    }
  },

  async generateCover(title: string, prompt: string) {
    const ai = getAI();
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            { text: `A professional, cinematic, and artistic book cover for a title "${title}". Theme: ${prompt}. No text on the image, purely artistic illustration, highly detailed, 4k quality.` },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: "3:4"
          }
        }
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
      return `https://picsum.photos/seed/${encodeURIComponent(title)}/400/600`;
    } catch (error) {
      console.error("Cover generation error:", error);
      return `https://picsum.photos/seed/${encodeURIComponent(title)}/400/600`;
    }
  },

  async getAudioBuffer(base64: string) {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    const bytes = decode(base64);
    const audioBuffer = await decodeAudioData(bytes, audioContext, 24000, 1);
    return { audioBuffer, audioContext };
  }
};
