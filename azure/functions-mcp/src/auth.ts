import { ProxyOAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

const ALLOWED_EMAIL = process.env.ALLOWED_EMAIL!;
const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID!;
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET!;
const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID!;

// In-memory client store for MCP dynamic client registration.
// Claude.ai registers itself as an OAuth client via RFC 7591.
// We store the registration and map it to our Entra ID app credentials
// when proxying to Microsoft's endpoints.
const registeredClients = new Map<string, OAuthClientInformationFull>();

export const oauthProvider = new ProxyOAuthServerProvider({
  endpoints: {
    authorizationUrl: `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`,
    revocationUrl: `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/logout`,
  },

  verifyAccessToken: async (token: string): Promise<AuthInfo> => {
    console.log('verifyAccessToken called, token length:', token.length);

    // Microsoft access tokens are verified by calling MS Graph — if the token
    // is valid, Graph returns user profile data; otherwise it returns 401.
    const response = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    console.log('MS Graph /me response status:', response.status);

    if (!response.ok) {
      const body = await response.text();
      console.error('MS Graph /me error:', body);
      throw new Error('Invalid or expired token');
    }

    const profile = await response.json() as {
      mail?: string;
      userPrincipalName?: string;
    };

    // Microsoft uses `mail` for mailbox email and `userPrincipalName` as fallback
    const email = profile.mail || profile.userPrincipalName;
    console.log('MS Graph email:', email);

    if (!email || email.toLowerCase() !== ALLOWED_EMAIL.toLowerCase()) {
      console.error('Email mismatch:', email, 'vs', ALLOWED_EMAIL);
      throw new Error('Forbidden: unauthorized email');
    }

    return {
      token,
      clientId: AZURE_CLIENT_ID,
      scopes: ['openid', 'email', 'profile'],
      // Microsoft access tokens last 60–90 minutes — set expiry so the SDK doesn't reject it
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      extra: { email },
    };
  },

  getClient: async (clientId: string): Promise<OAuthClientInformationFull | undefined> => {
    // Return registered client if we have it, mapping to our Entra ID app credentials
    const registered = registeredClients.get(clientId);
    if (registered) {
      return {
        ...registered,
        client_id: AZURE_CLIENT_ID,
        client_secret: AZURE_CLIENT_SECRET,
      };
    }

    // If Claude.ai sends our Azure Client ID directly
    if (clientId === AZURE_CLIENT_ID) {
      return {
        client_id: AZURE_CLIENT_ID,
        client_secret: AZURE_CLIENT_SECRET,
        // The SDK's authorize handler uses Array.includes() which fails with URL objects —
        // must be plain strings.
        redirect_uris: [
          'https://claude.ai/api/mcp/auth_callback',
        ] as any,
      } as unknown as OAuthClientInformationFull;
    }

    return undefined;
  },
});

// Override the clients store to support dynamic client registration
const originalClientsStore = oauthProvider.clientsStore;
(oauthProvider as any).__clientsStore = {
  getClient: originalClientsStore.getClient,
  registerClient: async (clientMetadata: any): Promise<OAuthClientInformationFull> => {
    // Claude.ai dynamically registers — we accept it and assign our Entra ID client ID
    const clientId = `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const registered: OAuthClientInformationFull = {
      ...clientMetadata,
      client_id: clientId,
      client_secret: AZURE_CLIENT_SECRET,
      client_id_issued_at: Math.floor(Date.now() / 1000),
    };
    registeredClients.set(clientId, registered);
    return registered;
  },
};

// Patch clientsStore getter
Object.defineProperty(oauthProvider, 'clientsStore', {
  get() {
    return (this as any).__clientsStore;
  },
});
