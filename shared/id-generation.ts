import { randomBytes } from 'node:crypto';

export function generateContactId(): string {
  return `c_${randomBytes(6).toString('hex')}`;
}

export function generateInteractionId(): string {
  return `i_${randomBytes(6).toString('hex')}`;
}
