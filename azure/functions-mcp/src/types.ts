export type InteractionType = 'catch-up' | 'meeting' | 'call' | 'message' | 'event' | 'other';

export interface ContactInfo {
  email?: string | null;
  phone?: string | null;
  linkedin?: string | null;
}

export interface Contact {
  id: string;
  name: string;
  nickname?: string | null;
  company?: string | null;
  role?: string | null;
  howWeMet?: string | null;
  tags: string[];
  contactInfo: ContactInfo;
  createdAt: string;
  updatedAt: string;
}

export interface Interaction {
  id: string;
  contactId: string;
  date: string;         // YYYY-MM-DD
  type: InteractionType;
  summary: string;
  topics: string[];
  followUp?: string | null;
  createdAt: string;
}
