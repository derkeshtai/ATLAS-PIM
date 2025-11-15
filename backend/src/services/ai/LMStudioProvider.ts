import axios, { AxiosInstance } from 'axios';
import {
  AIProvider,
  AIGenerationOptions,
  AIGenerationResult,
  AIStructuredResult
} from './AIProvider';

interface LMStudioCompletionRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface LMStudioCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class LMStudioProvider extends AIProvider {
  private client: AxiosInstance;
  private endpoint: string;
  private model: string;

  constructor(endpoint: string, model: string) {
    super('lmstudio');
    this.endpoint = endpoint;
    this.model = model;

    // LM Studio uses OpenAI-compatible API
    this.client = axios.create({
      baseURL: endpoint,
      timeout: 120000, // 2 minutos para modelos locales que pueden ser lentos
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Verificar si LM Studio está disponible
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Intentar hacer una petición simple para verificar que el servidor responde
      const response = await this.client.get('/models');
      return response.status === 200;
    } catch (error) {
      console.error('LM Studio not available:', error);
      return false;
    }
  }

  /**
   * Generar texto con LM Studio
   */
  async generateText(
    prompt: string,
    options?: AIGenerationOptions
  ): Promise<AIGenerationResult> {
    const startTime = Date.now();

    try {
      const request: LMStudioCompletionRequest = {
        model: this.model,
        messages: [
          ...(options?.systemPrompt
            ? [{ role: 'system', content: options.systemPrompt }]
            : []),
          { role: 'user', content: prompt }
        ],
        temperature: options?.temperature || 0.7,
        max_tokens: options?.maxTokens || 4000,
        stream: false
      };

      const response = await this.client.post<LMStudioCompletionResponse>(
        '/v1/chat/completions',
        request
      );

      const durationMs = Date.now() - startTime;

      if (!response.data.choices || response.data.choices.length === 0) {
        throw new Error('No response from LM Studio');
      }

      const text = response.data.choices[0].message.content;

      return {
        text,
        promptTokens: response.data.usage?.prompt_tokens,
        completionTokens: response.data.usage?.completion_tokens,
        totalTokens: response.data.usage?.total_tokens,
        costUSD: 0, // Local inference has no cost
        durationMs,
        model: this.model
      };
    } catch (error) {
      console.error('Error calling LM Studio:', error);

      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          throw new Error('LM Studio server not running. Please start LM Studio and load a model.');
        }
        if (error.response?.status === 404) {
          throw new Error('LM Studio endpoint not found. Verify the endpoint URL.');
        }
      }

      throw new Error(`LM Studio error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generar respuesta estructurada (JSON) con LM Studio
   */
  async generateStructured<T>(
    prompt: string,
    schema?: any,
    options?: AIGenerationOptions
  ): Promise<AIStructuredResult<T>> {
    const enhancedPrompt = `${prompt}

CRITICAL: Respond ONLY with valid JSON. No markdown, no explanations, no code blocks. Just the raw JSON object.`;

    const result = await this.generateText(enhancedPrompt, options);

    try {
      // Limpiar la respuesta en caso de que venga con markdown
      let jsonText = result.text.trim();

      // Remover bloques de markdown si existen
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\n/, '').replace(/\n```$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\n/, '').replace(/\n```$/, '');
      }

      // Algunos modelos locales agregan texto antes o después del JSON
      // Intentar extraer el JSON
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonText = jsonMatch[0];
      }

      const data = JSON.parse(jsonText) as T;

      return {
        data,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        totalTokens: result.totalTokens,
        costUSD: 0,
        durationMs: result.durationMs,
        model: result.model
      };
    } catch (error) {
      console.error('Error parsing JSON from LM Studio:', error);
      console.error('Raw response:', result.text);
      throw new Error(`Failed to parse JSON response from LM Studio: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * LM Studio no soporta visión multimodal (al menos no en la mayoría de modelos)
   * Dejamos el método sin implementar
   */
  // analyzeImage not implemented for LM Studio
}
