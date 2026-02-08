import { Injectable } from '@angular/core';
import { GoogleGenAI, Type, Schema } from '@google/genai';

@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env['API_KEY']! });
  }

  async analyzeTopic(topic: string, context: string): Promise<{ complexity: number; subtopics: string[]; summary: string }> {
    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        complexity: {
          type: Type.INTEGER,
          description: "Estimated complexity of the topic on a scale of 1 to 10, where 10 is extremely dense academic material.",
        },
        subtopics: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "A list of 3-5 key sub-concepts or chapters within this topic that should be reviewed.",
        },
        summary: {
          type: Type.STRING,
          description: "A very brief, one-sentence sci-fi style description of the data packet.",
        }
      },
      required: ["complexity", "subtopics", "summary"],
    };

    try {
      const result = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Analyze the learning topic: "${topic}". Context: ${context}. return a JSON response.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema
        }
      });

      const text = result.text;
      if (!text) throw new Error('No response from Cortex AI');
      return JSON.parse(text);
    } catch (error) {
      console.error('AI Analysis Failed:', error);
      // Fallback
      return {
        complexity: 5,
        subtopics: ['Core Concepts', 'Advanced Theory', 'Practical Application'],
        summary: 'Data packet analysis failed. Standard protocol initiated.'
      };
    }
  }
}