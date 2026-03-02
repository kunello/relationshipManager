import { Storage } from '@google-cloud/storage';
import { EMPTY_TAG_DICTIONARY, DEFAULT_CONFIG } from './shared/constants.js';
import type { Contact, Interaction, TagDictionary, ContactSummary, CrmConfig } from './types.js';

const storage = new Storage();
const BUCKET = process.env.DATA_BUCKET_NAME!;

async function readJson<T>(key: string): Promise<T> {
  try {
    const [buffer] = await storage.bucket(BUCKET).file(key).download();
    return JSON.parse(buffer.toString('utf-8')) as T;
  } catch (err: any) {
    if (err.code === 404) {
      return [] as unknown as T;
    }
    throw err;
  }
}

async function writeJson<T>(key: string, data: T): Promise<void> {
  const contents = JSON.stringify(data, null, 2) + '\n';
  await storage.bucket(BUCKET).file(key).save(contents, {
    contentType: 'application/json',
  });
}

export async function readContacts(): Promise<Contact[]> {
  return readJson<Contact[]>('contacts.json');
}

export async function writeContacts(contacts: Contact[]): Promise<void> {
  return writeJson('contacts.json', contacts);
}

export async function readInteractions(): Promise<Interaction[]> {
  return readJson<Interaction[]>('interactions.json');
}

export async function writeInteractions(interactions: Interaction[]): Promise<void> {
  return writeJson('interactions.json', interactions);
}

export async function readTags(): Promise<TagDictionary> {
  try {
    const [buffer] = await storage.bucket(BUCKET).file('tags.json').download();
    return JSON.parse(buffer.toString('utf-8')) as TagDictionary;
  } catch (err: any) {
    if (err.code === 404) {
      return { ...EMPTY_TAG_DICTIONARY };
    }
    throw err;
  }
}

export async function writeTags(tags: TagDictionary): Promise<void> {
  return writeJson('tags.json', tags);
}

export async function readSummaries(): Promise<ContactSummary[]> {
  return readJson<ContactSummary[]>('contact-summaries.json');
}

export async function writeSummaries(summaries: ContactSummary[]): Promise<void> {
  return writeJson('contact-summaries.json', summaries);
}

export async function readConfig(): Promise<CrmConfig> {
  try {
    const [buffer] = await storage.bucket(BUCKET).file('config.json').download();
    return JSON.parse(buffer.toString('utf-8')) as CrmConfig;
  } catch (err: any) {
    if (err.code === 404) {
      return { ...DEFAULT_CONFIG };
    }
    throw err;
  }
}

export async function writeConfig(config: CrmConfig): Promise<void> {
  return writeJson('config.json', config);
}

export async function readOAuthClients(): Promise<Record<string, any>> {
  try {
    const [buffer] = await storage.bucket(BUCKET).file('oauth-clients.json').download();
    return JSON.parse(buffer.toString('utf-8')) as Record<string, any>;
  } catch (err: any) {
    if (err.code === 404) {
      return {};
    }
    throw err;
  }
}

export async function writeOAuthClients(clients: Record<string, any>): Promise<void> {
  return writeJson('oauth-clients.json', clients);
}
