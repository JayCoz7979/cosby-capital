/**
 * OTP generation, hashing, and constant-time verification utilities.
 *
 * Security:
 * - S16-004: verifyOtp uses crypto.timingSafeEqual (constant-time comparison)
 * - OTPs stored as SHA-256 hashes — never plaintext (replay prevention)
 * - crypto.randomInt provides cryptographically secure randomness
 * - OTP value NEVER logged — only hash (if needed for debugging)
 */

import { createHash, randomInt, timingSafeEqual } from "crypto";

/**
 * Generates a cryptographically secure 6-digit OTP string.
 * Uses crypto.randomInt for unbiased, secure random generation.
 * Returns a zero-padded 6-character string (e.g., "042318").
 */
export function generateOtp(): string {
  // randomInt(100000, 999999) range gives 6-digit codes 100000–999999
  const otp = randomInt(100000, 1000000);
  return otp.toString().padStart(6, "0");
}

/**
 * Hashes an OTP with SHA-256 for safe storage.
 * Never store OTPs in plaintext — only the hash goes to the database.
 *
 * @param otp - The plaintext OTP to hash
 * @returns 64-character hex string (SHA-256 hash)
 */
export function hashOtp(otp: string): string {
  return createHash("sha256").update(otp, "utf8").digest("hex");
}

/**
 * Constant-time OTP verification (S16-004).
 *
 * Hashes the provided OTP and compares to the stored hash using
 * crypto.timingSafeEqual to prevent timing side-channel attacks.
 *
 * @param provided - The raw OTP entered by the user (plaintext)
 * @param storedHash - The SHA-256 hash stored in the database
 * @returns true if OTP matches, false otherwise
 */
export function verifyOtp(provided: string, storedHash: string): boolean {
  try {
    // Hash the provided OTP to compare in the same domain as the stored hash
    const providedHash = hashOtp(provided);

    // Both must be the same byte length for timingSafeEqual
    const a = Buffer.from(providedHash, "hex");
    const b = Buffer.from(storedHash, "hex");

    // Length mismatch would indicate corrupted stored hash — fail safely
    if (a.length !== b.length) {
      return false;
    }

    return timingSafeEqual(a, b);
  } catch {
    // Never throw from verification — always return false on error
    return false;
  }
}
