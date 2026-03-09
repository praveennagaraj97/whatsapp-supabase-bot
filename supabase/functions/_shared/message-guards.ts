// Message guard utilities: dedup, out-of-order detection, sanitization
import { MAX_INPUT_LENGTH } from './constants.ts';
import type { SimplifiedMessage, UserSession } from './types.ts';

/**
 * Get a deduplication key from a message
 */
export function getMessageDedupKey(message: SimplifiedMessage): string {
  if (message.type === 'audio') {
    return message.audioId || message.audioUrl || '';
  }
  if (message.type === 'location') {
    return JSON.stringify(message.location || {});
  }
  return message.text || message.audioUrl || '';
}

/**
 * Check if this message was already processed (same content + timestamp)
 */
export function isDuplicateInboundMessage(
  session: UserSession,
  message: SimplifiedMessage,
): boolean {
  const key = getMessageDedupKey(message);
  return (
    (session.last_user_message || '') === key &&
    (session.last_message_timestamp || '') === message.timestamp
  );
}

/**
 * Check if this message is older than the last processed one
 */
export function isOutOfOrderInboundMessage(
  session: UserSession,
  message: SimplifiedMessage,
): boolean {
  if (!session.last_message_timestamp) return false;
  const lastTs = Number(session.last_message_timestamp);
  const currentTs = Number(message.timestamp);
  if (Number.isNaN(lastTs) || Number.isNaN(currentTs)) return false;
  return currentTs <= lastTs;
}

// Prompt injection detection patterns
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?)/gi,
  /you\s+are\s+now\s+a/gi,
  /act\s+as\s+(if\s+you\s+are|a)/gi,
  /forget\s+(all\s+)?(your|previous)/gi,
  /disregard\s+(all\s+)?(previous|above|prior)/gi,
  /new\s+instructions?:/gi,
  /system\s*prompt/gi,
  /\[system\]/gi,
  /\[assistant\]/gi,
  /\[user\]/gi,
  /<\/?system>/gi,
  /<\/?assistant>/gi,
  /<\/?user>/gi,
  /\{\{[\s\S]*?\}\}/g,
];

/**
 * Check if input contains suspicious prompt injection patterns
 */
export function hasSuspiciousPatterns(input: string): boolean {
  if (!input) return false;
  return INJECTION_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0; // Reset regex state
    return pattern.test(input);
  });
}

/**
 * Sanitize user input to mitigate prompt injection
 */
export function sanitizeUserInput(input: string): string {
  if (!input || typeof input !== 'string') return '';
  let sanitized = input.slice(0, MAX_INPUT_LENGTH);
  for (const pattern of INJECTION_PATTERNS) {
    pattern.lastIndex = 0;
    sanitized = sanitized.replace(pattern, '[filtered]');
  }
  return sanitized.trim();
}
