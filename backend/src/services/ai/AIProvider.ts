/**
 * Interfaz abstracta para providers de IA
 * Permite intercambiar entre Claude API y LM Studio sin cambiar el código de curación
 */

export interface AIGenerationOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export interface AIGenerationResult {
  text: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  costUSD?: number;
  durationMs: number;
  model: string;
}

export interface AIStructuredResult<T> extends Omit<AIGenerationResult, 'text'> {
  data: T;
}

export interface ProductCurationInput {
  productId: string;
  sku: string;
  name: string;
  shortDescription?: string;
  longDescription?: string;
  brand?: string;
  category?: string;
  specifications?: Array<{ key: string; value: string }>;
  price?: number;
  currency?: string;
  images?: string[];
}

export interface GeneratedDescription {
  shortDescription: string;
  longDescription: string;
  bulletPoints: string[];
}

export interface GeneratedSEO {
  title: string;
  description: string;
  keywords: string;
}

export interface ValidationResult {
  isValid: boolean;
  issues: Array<{
    field: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
    suggestion?: string;
  }>;
  score: number; // 0-100
}

export interface CategorizationResult {
  suggestedCategoryId?: string;
  suggestedCategoryPath: string;
  confidence: number; // 0-1
  reasoning: string;
}

/**
 * Interfaz base que todos los providers deben implementar
 */
export abstract class AIProvider {
  protected providerName: string;

  constructor(providerName: string) {
    this.providerName = providerName;
  }

  /**
   * Generar texto simple con un prompt
   */
  abstract generateText(
    prompt: string,
    options?: AIGenerationOptions
  ): Promise<AIGenerationResult>;

  /**
   * Generar respuesta estructurada (JSON)
   */
  abstract generateStructured<T>(
    prompt: string,
    schema?: any,
    options?: AIGenerationOptions
  ): Promise<AIStructuredResult<T>>;

  /**
   * Generar descripción de producto mejorada
   */
  async generateProductDescription(
    product: ProductCurationInput,
    options?: AIGenerationOptions
  ): Promise<AIStructuredResult<GeneratedDescription>> {
    const prompt = this.buildDescriptionPrompt(product);
    return this.generateStructured<GeneratedDescription>(prompt, null, options);
  }

  /**
   * Generar contenido SEO
   */
  async generateSEO(
    product: ProductCurationInput,
    options?: AIGenerationOptions
  ): Promise<AIStructuredResult<GeneratedSEO>> {
    const prompt = this.buildSEOPrompt(product);
    return this.generateStructured<GeneratedSEO>(prompt, null, options);
  }

  /**
   * Validar datos de producto
   */
  async validateProduct(
    product: ProductCurationInput,
    options?: AIGenerationOptions
  ): Promise<AIStructuredResult<ValidationResult>> {
    const prompt = this.buildValidationPrompt(product);
    return this.generateStructured<ValidationResult>(prompt, null, options);
  }

  /**
   * Categorizar producto
   */
  async categorizeProduct(
    product: ProductCurationInput,
    availableCategories: Array<{ id: string; name: string; path: string }>,
    options?: AIGenerationOptions
  ): Promise<AIStructuredResult<CategorizationResult>> {
    const prompt = this.buildCategorizationPrompt(product, availableCategories);
    return this.generateStructured<CategorizationResult>(prompt, null, options);
  }

  /**
   * Analizar imagen (solo providers que soporten visión)
   */
  async analyzeImage?(
    imageUrl: string,
    prompt: string,
    options?: AIGenerationOptions
  ): Promise<AIGenerationResult>;

  /**
   * Verificar si el provider está disponible y configurado
   */
  abstract isAvailable(): Promise<boolean>;

  /**
   * Obtener información del provider
   */
  getProviderInfo(): { name: string; supportsVision: boolean } {
    return {
      name: this.providerName,
      supportsVision: typeof this.analyzeImage === 'function'
    };
  }

  // Prompts optimizados (pueden ser sobreescritos por providers específicos)

  protected buildDescriptionPrompt(product: ProductCurationInput): string {
    return `Eres un experto en redacción de contenido para e-commerce. Tu tarea es generar descripciones atractivas y precisas para productos.

INFORMACIÓN DEL PRODUCTO:
- Nombre: ${product.name}
- Marca: ${product.brand || 'No especificada'}
- Categoría: ${product.category || 'No especificada'}
- Descripción actual: ${product.shortDescription || product.longDescription || 'No disponible'}
${product.specifications && product.specifications.length > 0 ? `
- Especificaciones técnicas:
${product.specifications.map(s => `  * ${s.key}: ${s.value}`).join('\n')}
` : ''}
- Precio: ${product.price ? `${product.price} ${product.currency || 'MXN'}` : 'No disponible'}

TAREA:
Genera una descripción mejorada del producto en formato JSON con la siguiente estructura:

{
  "shortDescription": "Descripción corta de 1-2 líneas (max 160 caracteres) que capture la esencia del producto",
  "longDescription": "Descripción detallada de 3-5 párrafos que incluya: características principales, beneficios, usos, especificaciones relevantes",
  "bulletPoints": ["Punto clave 1", "Punto clave 2", "Punto clave 3", "Punto clave 4", "Punto clave 5"]
}

INSTRUCCIONES:
- Usa un tono profesional pero cercano
- Enfócate en beneficios, no solo características
- Incluye palabras clave relevantes para SEO
- La descripción debe ser precisa basándose en los datos proporcionados
- No inventes especificaciones que no estén en los datos
- Responde SOLO con JSON válido, sin explicaciones adicionales`;
  }

  protected buildSEOPrompt(product: ProductCurationInput): string {
    return `Eres un experto en SEO para e-commerce. Genera contenido SEO optimizado para el siguiente producto:

PRODUCTO:
- Nombre: ${product.name}
- Marca: ${product.brand || 'No especificada'}
- Categoría: ${product.category || 'No especificada'}
- Descripción: ${product.shortDescription || product.longDescription || ''}

TAREA:
Genera contenido SEO en formato JSON:

{
  "title": "Título SEO optimizado (50-60 caracteres, incluye marca y característica principal)",
  "description": "Meta description (150-160 caracteres, persuasiva, con call-to-action)",
  "keywords": "palabra1, palabra2, palabra3, palabra4, palabra5 (5-8 keywords separadas por comas)"
}

INSTRUCCIONES:
- El título debe ser clickeable y descriptivo
- La descripción debe persuadir a hacer clic
- Las keywords deben ser relevantes y específicas
- Incluye la marca en el título si está disponible
- Responde SOLO con JSON válido`;
  }

  protected buildValidationPrompt(product: ProductCurationInput): string {
    return `Eres un auditor de calidad de datos para e-commerce. Analiza el siguiente producto y detecta problemas:

PRODUCTO:
${JSON.stringify(product, null, 2)}

TAREA:
Valida el producto y responde en formato JSON:

{
  "isValid": true o false,
  "issues": [
    {
      "field": "nombre_del_campo",
      "severity": "error" | "warning" | "info",
      "message": "Descripción del problema",
      "suggestion": "Sugerencia de corrección"
    }
  ],
  "score": 0-100 (puntuación de calidad general)
}

CRITERIOS DE VALIDACIÓN:
- Nombre: debe ser descriptivo, sin códigos extraños
- Descripción: debe tener al menos 50 palabras
- Precio: debe ser mayor a 0
- Marca: debe estar presente
- Categoría: debe estar presente
- Especificaciones: deben ser coherentes
- Detect issues like: ALL CAPS, missing data, inconsistencies, poor formatting

Responde SOLO con JSON válido`;
  }

  protected buildCategorizationPrompt(
    product: ProductCurationInput,
    categories: Array<{ id: string; name: string; path: string }>
  ): string {
    return `Eres un experto en clasificación de productos. Categoriza el siguiente producto:

PRODUCTO:
- Nombre: ${product.name}
- Marca: ${product.brand || 'No especificada'}
- Descripción: ${product.shortDescription || product.longDescription || ''}
${product.specifications ? `- Especificaciones: ${JSON.stringify(product.specifications)}` : ''}

CATEGORÍAS DISPONIBLES:
${categories.map(c => `- ${c.id}: ${c.path}`).join('\n')}

TAREA:
Selecciona la categoría más apropiada en formato JSON:

{
  "suggestedCategoryId": "uuid_de_la_categoria",
  "suggestedCategoryPath": "ruta/completa/de/la/categoria",
  "confidence": 0.95 (0-1),
  "reasoning": "Breve explicación de por qué elegiste esta categoría"
}

Responde SOLO con JSON válido`;
  }
}
