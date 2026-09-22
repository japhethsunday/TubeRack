/**
 * Future integration boundary. Each provider family gets an adapter shaped
 * like this when its phase arrives. No implementations, no fake providers —
 * only the contracts the backend will call.
 */

export interface ProviderResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  usage?: { units: number; model?: string };
}

export interface TextProvider {
  readonly family: "text";
  generateText(input: { prompt: string; maxTokens?: number }): Promise<ProviderResult<{ text: string; model: string }>>;
}

export interface ImageProvider {
  readonly family: "image";
  generateImage(input: { prompt: string; aspectRatio?: string }): Promise<ProviderResult<{ url: string; storageKey: string }>>;
}

export interface VideoProvider {
  readonly family: "video";
  queueClip(input: { prompt: string; seconds: number }): Promise<ProviderResult<{ jobId: string }>>;
}

export interface TtsProvider {
  readonly family: "tts";
  synthesize(input: { text: string; voice: string }): Promise<ProviderResult<{ audioKey: string; seconds: number }>>;
}

export interface MusicProvider {
  readonly family: "music";
  compose(input: { mood: string; seconds: number }): Promise<ProviderResult<{ audioKey: string }>>;
}

export interface EmailProvider {
  readonly family: "email";
  send(input: { to: string; subject: string; text: string }): Promise<ProviderResult<{ messageId: string }>>;
}

export interface PaymentsProvider {
  readonly family: "payments";
  checkout(input: { workspaceId: string; plan: string }): Promise<ProviderResult<{ url: string }>>;
}

export interface PlatformProvider {
  readonly family: "platform";
  publish(input: { pack: Record<string, string> }): Promise<ProviderResult<{ externalId: string }>>;
}

export type AnyProvider =
  | TextProvider
  | ImageProvider
  | VideoProvider
  | TtsProvider
  | MusicProvider
  | EmailProvider
  | PaymentsProvider
  | PlatformProvider;
