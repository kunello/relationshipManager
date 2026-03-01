import type { InteractionType, TagDictionary, CrmConfig } from './types.js';

export const VALID_INTERACTION_TYPES: InteractionType[] = [
  'catch-up', 'meeting', 'call', 'message', 'event', 'other',
];

export const EMPTY_TAG_DICTIONARY: TagDictionary = {
  version: 1,
  contactTags: [],
  interactionTopics: [],
  expertiseAreas: [],
};

export const DEFAULT_CONFIG: CrmConfig = { privateKey: '' };
