import Anthropic from '@anthropic-ai/sdk';
import {
  AIProvider,
  AIGenerationOptions,
  AIGenerationResult,
  AIStructuredResult
} from './AIProvider';

export class ClaudeProvider extends AIProvider {
  private client: Anthropic | null = null;
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model?: string) {
    super('claude');
    this.apiKey = apiKey;
    this.model = model || 'claude-sonnet-4-5-20250929';

    if (this.apiKey) {
      this.client = new Anthropic({
        apiKey: this.apiKey
      });
    }
  }

  /**
   * Verificar si Claude está disponible y configurado
   */
  async isAvailable(): Promise<boolean> {
    if (!this.apiKey || !this.client) {
      return false;
    }

    try {
      // Test simple para verificar que la API key funciona
      await this.client.messages.create({
        model: this.model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }]
      });
      return true;
    } catch (error) {
      console.error('Claude API not available:', error);
      return false;
    }
  }

  /**
   * Generar texto con Claude
   */
  async generateText(
    prompt: string,
    options?: AIGenerationOptions
  ): Promise<AIGenerationResult> {
    if (!this.client) {
      throw new Error('Claude API not configured');
    }

    const startTime = Date.now();

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: options?.maxTokens || 4000,
        temperature: options?.temperature || 0.7,
        system: options?.systemPrompt,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      const durationMs = Date.now() - startTime;

      // Extraer texto de la respuesta
      const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => (block as any).text)
        .join('\n');

      // Calcular costo estimado (precios de Claude API)
      const inputCost = (response.usage.input_tokens / 1_000_000) * 3.0; // $3 per million tokens
      const outputCost = (response.usage.output_tokens / 1_000_000) * 15.0; // $15 per million tokens
      const totalCost = inputCost + outputCost;

      return {
        text,
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        costUSD: totalCost,
        durationMs,
        model: this.model
      };
    } catch (error) {
      console.error('Error calling Claude API:', error);
      throw new Error(`Claude API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generar respuesta estructurada (JSON) con Claude
   */
  async generateStructured<T>(
    prompt: string,
    schema?: any,
    options?: AIGenerationOptions
  ): Promise<AIStructuredResult<T>> {
    const enhancedPrompt = `${prompt}

IMPORTANTE: Responde ÚNICAMENTE con JSON válido, sin markdown, sin explicaciones adicionales, sin el bloque \`\`\`json. Solo el objeto JSON.`;

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

      const data = JSON.parse(jsonText) as T;

      return {
        data,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        totalTokens: result.totalTokens,
        costUSD: result.costUSD,
        durationMs: result.durationMs,
        model: result.model
      };
    } catch (error) {
      console.error('Error parsing JSON from Claude:', error);
      console.error('Raw response:', result.text);
      throw new Error(`Failed to parse JSON response from Claude: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Analizar imagen con Claude (visión multimodal)
   */
  async analyzeImage(
    imageUrl: string,
    prompt: string,
    options?: AIGenerationOptions
  ): Promise<AIGenerationResult> {
    if (!this.client) {
      throw new Error('Claude API not configured');
    }

    const startTime = Date.now();

    try {
      // Descargar la imagen y convertirla a base64
      const response = await fetch(imageUrl);
      const arrayBuffer = await response.arrayBuffer();
      const base64Image = Buffer.from(arrayBuffer).toString('base64');

      // Detectar tipo de imagen
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const mediaType = contentType.split('/')[1] as 'jpeg' | 'png' | 'gif' | 'webp';

      const claudeResponse = await this.client.messages.create({
        model: this.model,
        max_tokens: options?.maxTokens || 4000,
        temperature: options?.temperature || 0.7,
        system: options?.systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: base64Image
                }
              },
              {
                type: 'text',
                text: prompt
              }
            ]
          }
        ]
      });

      const durationMs = Date.now() - startTime;

      const text = claudeResponse.content
        .filter((block) => block.type === 'text')
        .map((block) => (block as any).text)
        .join('\n');

      const inputCost = (claudeResponse.usage.input_tokens / 1_000_000) * 3.0;
      const outputCost = (claudeResponse.usage.output_tokens / 1_000_000) * 15.0;
      const totalCost = inputCost + outputCost;

      return {
        text,
        promptTokens: claudeResponse.usage.input_tokens,
        completionTokens: claudeResponse.usage.output_tokens,
        totalTokens: claudeResponse.usage.input_tokens + claudeResponse.usage.output_tokens,
        costUSD: totalCost,
        durationMs,
        model: this.model
      };
    } catch (error) {
      console.error('Error analyzing image with Claude:', error);
      throw new Error(`Claude vision error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
