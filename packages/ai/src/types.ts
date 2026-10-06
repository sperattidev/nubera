/**
 * Contratos de los proveedores de IA. Los módulos del sistema dependen solo
 * de estas interfaces; la implementación concreta se elige por configuración.
 */

export interface TextRequest {
  /** Identificador de la plantilla o tarea, p. ej. "hora-clima". */
  task: string;
  /** Datos para completar la plantilla o el prompt. */
  variables: Record<string, string | number>;
}

export interface TextProvider {
  readonly name: string;
  generate(request: TextRequest): Promise<string>;
}

export interface AudioResult {
  /** Audio codificado (por ejemplo WAV). */
  data: Uint8Array;
  mimeType: string;
}

export interface SpeechProvider {
  readonly name: string;
  synthesize(text: string, options?: { voice?: string }): Promise<AudioResult>;
}

export interface TranscriptSegment {
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface TranscribeProvider {
  readonly name: string;
  transcribe(audio: Uint8Array, options?: { language?: string }): Promise<TranscriptSegment[]>;
}
