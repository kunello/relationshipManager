import { ProxyOAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { readOAuthClients, writeOAuthClients } from './gcs-data.js';

const ALLOWED_EMAIL = process.env.ALLOWED_EMAIL!;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

// Write-through cache for MCP dynamic client registrations.
// In-memory Map serves as a hot cache; GCS (oauth-clients.json) is the durable store.
// On cold start the Map is empty — getClient falls through to GCS and backfills.
const registeredClients = new Map<string, OAuthClientInformationFull>();

export const oauthProvider = new ProxyOAuthServerProvider({
  endpoints: {
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    revocationUrl: 'https://oauth2.googleapis.com/revoke',
  },

  verifyAccessToken: async (token: string): Promise<AuthInfo> => {
    console.log('verifyAccessToken called, token length:', token.length);

    // Google access tokens can be verified via the userinfo endpoint
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });

    console.log('Google userinfo response status:', response.status);

    if (!response.ok) {
      const body = await response.text();
      console.error('Google userinfo error:', body);
      throw new Error('Invalid or expired token');
    }

    const userinfo = await response.json() as { email?: string; sub?: string };
    console.log('Google userinfo email:', userinfo.email);

    if (!userinfo.email || userinfo.email.toLowerCase() !== ALLOWED_EMAIL.toLowerCase()) {
      console.error('Email mismatch:', userinfo.email, 'vs', ALLOWED_EMAIL);
      throw new Error('Forbidden: unauthorized email');
    }

    return {
      token,
      clientId: GOOGLE_CLIENT_ID,
      scopes: ['openid', 'email', 'profile'],
      // Google access tokens last 1 hour — set expiry so the SDK doesn't reject it
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      extra: { email: userinfo.email },
    };
  },

  getClient: async (clientId: string): Promise<OAuthClientInformationFull | undefined> => {
    // Check in-memory cache first
    let registered = registeredClients.get(clientId);

    // Cache miss — try loading from GCS (handles cold starts / redeployments)
    if (!registered) {
      try {
        const persisted = await readOAuthClients();
        if (persisted[clientId]) {
          registered = persisted[clientId] as OAuthClientInformationFull;
          registeredClients.set(clientId, registered); // backfill cache
        }
      } catch (err) {
        console.error('Failed to read OAuth clients from GCS:', err);
      }
    }

    if (registered) {
      return {
        ...registered,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
      };
    }

    // If Claude.ai sends our Google Client ID directly
    if (clientId === GOOGLE_CLIENT_ID) {
      return {
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        // The SDK's authorize handler compares redirect_uri strings with Array.includes(),
        // so these must be plain strings despite the type expecting URL objects.
        redirect_uris: [
          'https://claude.ai/api/mcp/auth_callback',
        ] as any,
      } as unknown as OAuthClientInformationFull;
    }

    return undefined;
  },
});

// Override authorize() to inject Google-specific params for long-lived sessions.
// The SDK's default authorize() builds the URL from scratch, so we can't just
// append query params to authorizationUrl — they get overwritten. Instead, we
// wrap the method to add access_type=offline (requests a refresh token) and
// prompt=consent (ensures Google always returns one, not just on first auth).
const originalAuthorize = oauthProvider.authorize.bind(oauthProvider);
oauthProvider.authorize = async (client, params, res) => {
  // Intercept the response to inject our extra params before the redirect
  const interceptedRes = {
    ...res,
    redirect: (url: string) => {
      const parsed = new URL(url);
      parsed.searchParams.set('access_type', 'offline');
      parsed.searchParams.set('prompt', 'consent');
      res.redirect(parsed.toString());
    },
  };
  return originalAuthorize(client, params, interceptedRes as any);
};

// Override the clients store to support dynamic client registration
const originalClientsStore = oauthProvider.clientsStore;
(oauthProvider as any).__clientsStore = {
  getClient: originalClientsStore.getClient,
  registerClient: async (clientMetadata: any): Promise<OAuthClientInformationFull> => {
    // Claude.ai dynamically registers — we accept it and assign our Google client ID
    const clientId = `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const registered: OAuthClientInformationFull = {
      ...clientMetadata,
      client_id: clientId,
      client_secret: GOOGLE_CLIENT_SECRET,
      client_id_issued_at: Math.floor(Date.now() / 1000),
    };

    // Write-through: update in-memory cache and persist to GCS
    registeredClients.set(clientId, registered);
    try {
      const persisted = await readOAuthClients();
      persisted[clientId] = registered;
      await writeOAuthClients(persisted);
    } catch (err) {
      console.error('Failed to persist OAuth client to GCS:', err);
      // Registration still succeeds in-memory for this instance's lifetime
    }

    return registered;
  },
};

// Patch clientsStore getter
Object.defineProperty(oauthProvider, 'clientsStore', {
  get() {
    return (this as any).__clientsStore;
  },
});
