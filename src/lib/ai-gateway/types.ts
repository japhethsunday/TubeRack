import type { AICapability } from "@/src/types/domain";

/** Explicit integration-boundary error. Never fake a provider response. */
export class ProviderNotConfiguredError extends Error {
  readonly capability: AICapability;
  readonly code = "PROVIDER_NOT_CONFIGURED";

  constructor(capability: AICapability, detail?: string) {
    super(
      `AI ${capability} provider is not configured (Phase 11 integration boundary).${detail ? ` ${detail}` : ""}`,
    );
    this.name = "ProviderNotConfiguredError";
    this.capability = capability;
  }
}

export interface TextRequest {
  prompt: string;
  maxTokens?: number;
}

export interface TextResponse {
  text: string;
  model: string;
}

export interface TextProvider {
  readonly capability: "text";
  readonly name: string;
  generateText(request: TextRequest): Promise<TextResponse>;
}

export interface ImageRequest {
  prompt: string;
  aspectRatio?: "16:9" | "9:16" | "1:1";
}

export interface ImageResponse {
  url: string;
  prompt: string;
}

export interface ImageProvider {
  readonly capability: "image";
  readonly name: string;
  generateImage(request: ImageRequest): Promise<ImageResponse>;
}

export interface TtsRequest {
  text: string;
  voice?: string;
}

export interface TtsResponse {
  audioBase64: string;
  mimeType: string;
  model: string;
}

export interface TtsProvider {
  readonly capability: "tts";
  readonly name: string;
  synthesizeSpeech(request: TtsRequest): Promise<TtsResponse>;
}

export interface MusicRequest {
  prompt: string;
  durationSec?: number;
}

export interface MusicResponse {
  audioBase64: string;
  mimeType: string;
  model: string;
}

export interface MusicProvider {
  readonly capability: "music";
  readonly name: string;
  composeMusic(request: MusicRequest): Promise<MusicResponse>;
}

export interface TranscriptSegment {
  startSec: number;
  endSec: number;
  text: string;
}

export interface TranscriptionRequest {
  audioBase64: string;
  mimeType?: string;
  language?: string;
}

export interface TranscriptionResponse {
  text: string;
  segments: TranscriptSegment[];
  language?: string;
  model: string;
}

export interface TranscriptionProvider {
  readonly capability: "transcription";
  readonly name: string;
  transcribe(request: TranscriptionRequest): Promise<TranscriptionResponse>;
}

export interface RenderingRequest {
  composition: unknown;
  format?: "mp4" | "webm" | "gif";
}

export interface RenderingResponse {
  jobId: string;
}

export interface RenderingProvider {
  readonly capability: "video";
  readonly name: string;
  render(request: RenderingRequest): Promise<RenderingResponse>;
}

/** Union of provider contracts the gateway can route. Extend per capability in later phases. */
export type AIProvider = TextProvider | ImageProvider | TtsProvider | MusicProvider | TranscriptionProvider | RenderingProvider;
