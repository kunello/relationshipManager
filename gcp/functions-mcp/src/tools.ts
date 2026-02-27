import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const TOOLS: Tool[] = [
  {
    name: 'search_contacts',
    description: 'Search contacts by name, company, tag, expertise, or freeform text. Also searches notes. Private contacts are hidden unless privateKey is provided.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Freeform search across name, company, role, howWeMet, tags, expertise, notes' },
        tag: { type: 'string', description: 'Filter by exact tag' },
        company: { type: 'string', description: 'Filter by company (partial match)' },
        expertise: { type: 'string', description: 'Filter by expertise area (partial match)' },
        limit: { type: 'number', description: 'Max results (default 20)' },
        privateKey: { type: 'string', description: 'Passphrase to unlock private contacts and interactions' },
      },
    },
  },
  {
    name: 'get_contact',
    description: 'Get full contact details and all their interactions. Look up by name or ID. Private contacts require privateKey. Private interactions are filtered unless unlocked.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Contact name (partial match)' },
        contactId: { type: 'string', description: 'Exact contact ID' },
        privateKey: { type: 'string', description: 'Passphrase to unlock private contacts and interactions' },
      },
    },
  },
  {
    name: 'add_contact',
    description: 'Add a new contact. Requires full name (first + last). Always present the proposed record to the user for confirmation before calling this tool — verify spelling of name, company, and role. Set private: true to mark as private.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Full name' },
        nickname: { type: 'string' },
        company: { type: 'string' },
        role: { type: 'string' },
        howWeMet: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        email: { type: 'string' },
        phone: { type: 'string' },
        linkedin: { type: 'string' },
        notes: { type: 'array', items: { type: 'string' }, description: 'Persistent personal facts about this person' },
        expertise: { type: 'array', items: { type: 'string' }, description: 'Domain knowledge areas or specialisations' },
        forceDuplicate: { type: 'boolean', description: 'Set true to create a contact even when a matching name already exists (after confirming with the user that it is a different person)' },
        private: { type: 'boolean', description: 'Mark this contact as private (hidden without privateKey)' },
        privateKey: { type: 'string', description: 'Passphrase to unlock private contacts and interactions' },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_contact',
    description: 'Update an existing contact. Provide name/ID and an updates object with fields to change. Private contacts require privateKey. Include "private" in updates to toggle privacy.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Contact name (partial match)' },
        contactId: { type: 'string', description: 'Exact contact ID' },
        updates: {
          type: 'object',
          description: 'Fields to update: name, nickname, company, role, howWeMet, tags, notes, expertise, email, phone, linkedin, private',
        },
        privateKey: { type: 'string', description: 'Passphrase to unlock private contacts and interactions' },
      },
      required: ['updates'],
    },
  },
  {
    name: 'log_interaction',
    description: 'Log an interaction with one or more contacts. Supports multi-contact interactions (group dinners, meetings). Present the proposed record to the user for confirmation before writing. Set private: true to mark as private. Requires privateKey if any participant is private.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        contactNames: { type: 'array', items: { type: 'string' }, description: 'Contact names for multi-person interaction (partial match each)' },
        contactIds: { type: 'array', items: { type: 'string' }, description: 'Contact IDs for multi-person interaction' },
        contactName: { type: 'string', description: 'Single contact name (use contactNames for groups)' },
        contactId: { type: 'string', description: 'Single contact ID (use contactIds for groups)' },
        summary: { type: 'string', description: 'What happened' },
        date: { type: 'string', description: 'YYYY-MM-DD (defaults to today)' },
        type: { type: 'string', enum: ['catch-up', 'meeting', 'call', 'message', 'event', 'other'] },
        topics: { type: 'array', items: { type: 'string' } },
        mentionedNextSteps: { type: 'string', description: 'Context for future reference, not task assignments' },
        location: { type: 'string', description: 'Where the interaction took place' },
        forceCreate: { type: 'boolean', description: 'Set true to create even when a similar interaction exists nearby (after confirming with the user)' },
        private: { type: 'boolean', description: 'Mark this interaction as private (hidden without privateKey)' },
        privateKey: { type: 'string', description: 'Passphrase to unlock private contacts and interactions' },
      },
      required: ['summary'],
    },
  },
  {
    name: 'edit_interaction',
    description: 'Edit an existing interaction. Always confirm changes with the user before writing. Private interactions require privateKey. Include "private" in updates to toggle privacy.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        interactionId: { type: 'string', description: 'The interaction ID to edit' },
        updates: {
          type: 'object',
          description: 'Fields to update: summary, date, type, topics, mentionedNextSteps, location, private',
        },
        privateKey: { type: 'string', description: 'Passphrase to unlock private contacts and interactions' },
      },
      required: ['interactionId', 'updates'],
    },
  },
  {
    name: 'get_recent_interactions',
    description: 'Get recent interactions, optionally filtered by contact, date, or type. Private interactions are hidden unless privateKey is provided. Private participants are redacted from group interactions.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        contactName: { type: 'string', description: 'Filter by contact name' },
        contactId: { type: 'string', description: 'Filter by contact ID' },
        since: { type: 'string', description: 'Only on/after this date (YYYY-MM-DD)' },
        type: { type: 'string', enum: ['catch-up', 'meeting', 'call', 'message', 'event', 'other'] },
        limit: { type: 'number', description: 'Max results (default 20)' },
        privateKey: { type: 'string', description: 'Passphrase to unlock private contacts and interactions' },
      },
    },
  },
  {
    name: 'get_mentioned_next_steps',
    description: 'Get mentioned next steps from past interactions — context for future reference. Private interactions are excluded unless privateKey is provided.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Max results (default 50)' },
        privateKey: { type: 'string', description: 'Passphrase to unlock private contacts and interactions' },
      },
    },
  },
  {
    name: 'get_tags',
    description: 'Get the full tag dictionary with all contact tags, interaction topics, and expertise areas.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'manage_tags',
    description: 'Add, remove, update, or list tags in the tag dictionary.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        operation: { type: 'string', enum: ['add', 'remove', 'update', 'list'], description: 'Operation to perform' },
        category: { type: 'string', enum: ['contactTags', 'interactionTopics', 'expertiseAreas'], description: 'Tag category' },
        tag: { type: 'string', description: 'Tag name (required for add/remove/update)' },
        description: { type: 'string', description: 'Tag description (for add/update)' },
        aliases: { type: 'array', items: { type: 'string' }, description: 'Tag aliases (for add/update)' },
        newTag: { type: 'string', description: 'New tag name (for rename via update)' },
      },
      required: ['operation', 'category'],
    },
  },
  {
    name: 'delete_interaction',
    description: 'Delete an interaction by ID. Always confirm with the user before deleting. Private interactions require privateKey.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        interactionId: { type: 'string', description: 'The interaction ID to delete' },
        privateKey: { type: 'string', description: 'Passphrase to unlock private contacts and interactions' },
      },
      required: ['interactionId'],
    },
  },
  {
    name: 'delete_contact',
    description: 'Delete a contact by name or ID. If the contact has interactions, you must set deleteInteractions: true to also remove them. Private contacts require privateKey.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Contact name (partial match)' },
        contactId: { type: 'string', description: 'Exact contact ID' },
        deleteInteractions: { type: 'boolean', description: 'Also delete all interactions with this contact' },
        privateKey: { type: 'string', description: 'Passphrase to unlock private contacts and interactions' },
      },
    },
  },
  {
    name: 'manage_privacy',
    description: 'Manage the privacy passphrase. Use "set_key" to set or change the passphrase (requires currentKey if one already exists). Use "status" to check if a key is set and count private records.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        operation: { type: 'string', enum: ['set_key', 'status'], description: 'Operation to perform' },
        currentKey: { type: 'string', description: 'Current passphrase (required when changing an existing key)' },
        newKey: { type: 'string', description: 'New passphrase to set (required for set_key)' },
      },
      required: ['operation'],
    },
  },
];
