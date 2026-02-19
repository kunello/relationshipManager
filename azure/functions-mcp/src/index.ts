import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import { TOOLS } from './tools.js';
import { oauthProvider } from './auth.js';
import {
  searchContacts,
  getContact,
  addContact,
  updateContact,
  logInteraction,
  getRecentInteractions,
  getFollowups,
} from './handlers.js';

// ── Tool dispatch ────────────────────────────────────────────────────
const toolHandlers: Record<string, (args: any) => Promise<any>> = {
  search_contacts: searchContacts,
  get_contact: getContact,
  add_contact: addContact,
  update_contact: updateContact,
  log_interaction: logInteraction,
  get_recent_interactions: getRecentInteractions,
  get_followups: getFollowups,
};

// ── Create MCP server instance ───────────────────────────────────────
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'personal-crm',
    version: '1.0.0',
  });

  for (const tool of TOOLS) {
    const handler = toolHandlers[tool.name];
    if (!handler) continue;

    const schema: Record<string, any> = {};
    const props = (tool.inputSchema as any)?.properties ?? {};
    for (const [key, val] of Object.entries(props)) {
      schema[key] = val;
    }

    server.tool(
      tool.name,
      tool.description ?? '',
      schema,
      async ({ arguments: args }) => {
        try {
          const result = await handler(args);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          };
        } catch (err: any) {
          return {
            content: [{ type: 'text' as const, text: `Error: ${err.message}` }],
            isError: true,
          };
        }
      },
    );
  }

  return server;
}

// ── Express app ──────────────────────────────────────────────────────
const app = express();

// Azure Container Apps sits behind a load balancer — trust proxy headers
app.set('trust proxy', true);

// Parse JSON request bodies (required for MCP JSON-RPC messages)
app.use(express.json());

// Determine the server's public URL
const SERVICE_URL = process.env.SERVICE_URL
  ?? `http://localhost:${process.env.PORT ?? '8080'}`;
const serverUrl = new URL(SERVICE_URL);
const mcpServerUrl = new URL('/mcp', serverUrl);

// Install MCP OAuth auth router (handles /.well-known/*, /authorize, /token, /register)
app.use(mcpAuthRouter({
  provider: oauthProvider,
  issuerUrl: serverUrl,
  baseUrl: serverUrl,
  scopesSupported: ['openid', 'email', 'profile'],
  resourceName: 'Personal CRM',
}));

// Bearer auth middleware for MCP endpoints
const authMiddleware = requireBearerAuth({
  verifier: oauthProvider,
  requiredScopes: [],
  resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpServerUrl),
});

// Health check (no auth needed)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ── Session-based MCP transport ──────────────────────────────────────
const transports = new Map<string, StreamableHTTPServerTransport>();

// MCP POST handler
app.post('/mcp', authMiddleware, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  try {
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports.has(sessionId)) {
      transport = transports.get(sessionId)!;
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // New session
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => `crm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        onsessioninitialized: (sid) => {
          transports.set(sid, transport);
        },
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) transports.delete(sid);
      };

      const server = createMcpServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    } else {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

// MCP GET handler (SSE streams)
app.get('/mcp', authMiddleware, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  await transports.get(sessionId)!.handleRequest(req, res);
});

// MCP DELETE handler (session termination)
app.delete('/mcp', authMiddleware, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  await transports.get(sessionId)!.handleRequest(req, res);
});

// ── Start ────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? '8080', 10);
app.listen(PORT, () => {
  console.log(`MCP server listening on port ${PORT}`);
  console.log(`MCP endpoint: ${mcpServerUrl.toString()}`);
});
