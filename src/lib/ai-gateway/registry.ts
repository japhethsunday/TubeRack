import type { AICapability } from "@/src/types/domain";
import { ProviderNotConfiguredError } from "@/src/lib/ai-gateway/types";
import type { AIProvider } from "@/src/lib/ai-gateway/types";

/**
 * Provider-independent AI gateway registry.
 * Phase 1: registration + capability lookup only. No network calls, no fake responses.
 * Calling an unregistered capability throws ProviderNotConfiguredError.
 */
export class AIGateway {
  private providers = new Map<AICapability, AIProvider>();

  register(provider: AIProvider): void {
    this.providers.set(provider.capability, provider);
  }

  has(capability: AICapability): boolean {
    return this.providers.has(capability);
  }

  configuredCapabilities(): AICapability[] {
    return [...this.providers.keys()];
  }

  resolve<T extends AIProvider>(capability: AICapability): T {
    const provider = this.providers.get(capability);
    if (!provider) throw new ProviderNotConfiguredError(capability);
    return provider as T;
  }
}

let shared: AIGateway | null = null;

/** Shared gateway instance for server runtime. */
export function getGateway(): AIGateway {
  if (!shared) shared = new AIGateway();
  return shared;
}

/** For tests: fresh isolated gateway. */
export function createGateway(): AIGateway {
  return new AIGateway();
}
