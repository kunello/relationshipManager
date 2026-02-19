import { Storage } from '@google-cloud/storage';
import type { Contact, Interaction } from './types.js';

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
