import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const TOOLS: Tool[] = [
  {
    name: 'search_contacts',
    description: 'Search contacts by name, company, tag, expertise, or freeform text. Also searches notes.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Freeform search across name, company, role, howWeMet, tags, expertise, notes' },
        tag: { type: 'string', description: 'Filter by exact tag' },
        company: { type: 'string', description: 'Filter by company (partial match)' },
        expertise: { type: 'string', description: 'Filter by expertise area (partial match)' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
    },
  },
  {
    name: 'get_contact',
    description: 'Get full contact details and all their interactions. Look up by name or ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Contact name (partial match)' },
        contactId: { type: 'string', description: 'Exact contact ID' },
      },
    },
  },
  {
    name: 'add_contact',
    description: 'Add a new contact. Requires full name (first + last). Always present the proposed record to the user for confirmation before calling this tool — verify spelling of name, company, and role.',
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
      },
      required: ['name'],
    },
  },
  {
    name: 'update_contact',
    description: 'Update an existing contact. Provide name/ID and an updates object with fields to change.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Contact name (partial match)' },
        contactId: { type: 'string', description: 'Exact contact ID' },
        updates: {
          type: 'object',
          description: 'Fields to update: name, nickname, company, role, howWeMet, tags, notes, expertise, email, phone, linkedin',
        },
      },
      required: ['updates'],
    },
  },
  {
    name: 'log_interaction',
    description: 'Log an interaction with one or more contacts. Supports multi-contact interactions (group dinners, meetings). Present the proposed record to the user for confirmation before writing. Highlight assigned topics.',
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
      },
      required: ['summary'],
    },
  },
  {
    name: 'edit_interaction',
    description: 'Edit an existing interaction. Always confirm changes with the user before writing.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        interactionId: { type: 'string', description: 'The interaction ID to edit' },
        updates: {
          type: 'object',
          description: 'Fields to update: summary, date, type, topics, mentionedNextSteps, location',
        },
      },
      required: ['interactionId', 'updates'],
    },
  },
  {
    name: 'get_recent_interactions',
    description: 'Get recent interactions, optionally filtered by contact, date, or type.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        contactName: { type: 'string', description: 'Filter by contact name' },
        contactId: { type: 'string', description: 'Filter by contact ID' },
        since: { type: 'string', description: 'Only on/after this date (YYYY-MM-DD)' },
        type: { type: 'string', enum: ['catch-up', 'meeting', 'call', 'message', 'event', 'other'] },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
    },
  },
  {
    name: 'get_mentioned_next_steps',
    description: 'Get mentioned next steps from past interactions — context for future reference.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Max results (default 50)' },
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
    description: 'Delete an interaction by ID. Always confirm with the user before deleting. This cannot be undone.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        interactionId: { type: 'string', description: 'The interaction ID to delete' },
      },
      required: ['interactionId'],
    },
  },
  {
    name: 'delete_contact',
    description: 'Delete a contact by name or ID. If the contact has interactions, you must set deleteInteractions: true to also remove them. Always confirm with the user before deleting.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Contact name (partial match)' },
        contactId: { type: 'string', description: 'Exact contact ID' },
        deleteInteractions: { type: 'boolean', description: 'Also delete all interactions with this contact' },
      },
    },
  },
];
