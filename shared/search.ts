import type { Contact } from './types.js';

export function findContactByName(query: string, contacts: Contact[]): Contact[] {
  const q = query.toLowerCase();
  return contacts.filter(c =>
    c.name.toLowerCase().includes(q) ||
    (c.nickname && c.nickname.toLowerCase().includes(q))
  );
}
