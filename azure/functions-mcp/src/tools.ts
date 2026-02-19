import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const TOOLS: Tool[] = [
  {
    name: 'search_contacts',
    description: 'Search contacts by name, company, tag, or freeform text.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Freeform search across name, company, role, howWeMet, tags' },
        tag: { type: 'string', description: 'Filter by exact tag' },
        company: { type: 'string', description: 'Filter by company (partial match)' },
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
    description: 'Add a new contact (checks for duplicates first).',
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
          description: 'Fields to update: name, nickname, company, role, howWeMet, tags, email, phone, linkedin',
        },
      },
      required: ['updates'],
    },
  },
  {
    name: 'log_interaction',
    description: 'Log an interaction with a contact. Contact must exist.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        contactName: { type: 'string', description: 'Contact name (partial match)' },
        contactId: { type: 'string', description: 'Exact contact ID' },
        summary: { type: 'string', description: 'What happened' },
        date: { type: 'string', description: 'YYYY-MM-DD (defaults to today)' },
        type: { type: 'string', enum: ['catch-up', 'meeting', 'call', 'message', 'event', 'other'] },
        topics: { type: 'array', items: { type: 'string' } },
        followUp: { type: 'string', description: 'Action item, if any' },
      },
      required: ['summary'],
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
    name: 'get_followups',
    description: 'Get pending follow-up items from past interactions.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Max results (default 50)' },
      },
    },
  },
];
