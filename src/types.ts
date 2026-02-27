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
  notes: string[];
  expertise: string[];
  private?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Interaction {
  id: string;
  contactIds: string[];    // Array of participant contact IDs
  date: string;         // YYYY-MM-DD
  type: InteractionType;
  summary: string;
  topics: string[];
  mentionedNextSteps?: string | null;
  location?: string | null;
  private?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface TagEntry {
  tag: string;
  description: string;
  aliases: string[];
}

export interface TagDictionary {
  version: number;
  contactTags: TagEntry[];
  interactionTopics: TagEntry[];
  expertiseAreas: TagEntry[];
}

export interface CrmConfig {
  privateKey: string;
}

export interface ContactSummary {
  id: string;
  name: string;
  company: string | null;
  role: string | null;
  tags: string[];
  expertise: string[];
  interactionCount: number;
  lastInteraction: string | null;
  firstInteraction: string | null;
  topTopics: string[];
  locations: string[];
  recentSummary: string;
  mentionedNextSteps: string[];
  notes: string[];
}
