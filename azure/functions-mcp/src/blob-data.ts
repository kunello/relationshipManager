import { BlobServiceClient } from '@azure/storage-blob';
import type { Contact, Interaction } from './types.js';

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING!;
const containerName = process.env.AZURE_CONTAINER_NAME!;

const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
const containerClient = blobServiceClient.getContainerClient(containerName);

async function readJson<T>(blobName: string): Promise<T> {
  try {
    const blobClient = containerClient.getBlobClient(blobName);
    const response = await blobClient.download(0);

    // Stream the body to a buffer
    const chunks: Buffer[] = [];
    for await (const chunk of response.readableStreamBody as NodeJS.ReadableStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const content = Buffer.concat(chunks).toString('utf-8');
    return JSON.parse(content) as T;
  } catch (err: any) {
    if (err.statusCode === 404) {
      return [] as unknown as T;
    }
    throw err;
  }
}

async function writeJson<T>(blobName: string, data: T): Promise<void> {
  const content = JSON.stringify(data, null, 2) + '\n';
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  await blockBlobClient.upload(content, Buffer.byteLength(content, 'utf-8'), {
    blobHTTPHeaders: { blobContentType: 'application/json' },
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
