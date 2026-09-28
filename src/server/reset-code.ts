import { randomInt } from "node:crypto";
import { hashToken } from "@/src/server/crypto";

/** Password-reset codes: 6 digits, emailed, valid 15 minutes, one use. */
export const RESET_CODE_LENGTH = 6;
export const RESET_CODE_TTL_MS = 15 * 60 * 1000;

export function newResetCode(): string {
  return String(randomInt(0, 10 ** RESET_CODE_LENGTH)).padStart(RESET_CODE_LENGTH, "0");
}

/** Codes are short, so the stored hash is bound to the user (a code alone never matches). */
export function resetCodeHash(userId: string, code: string): string {
  return hashToken(`reset-code:${userId}:${code}`);
}

export function isResetCode(value: string): boolean {
  return new RegExp(`^\\d{${RESET_CODE_LENGTH}}$`).test(value);
}
