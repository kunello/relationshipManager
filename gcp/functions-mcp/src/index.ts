import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  isInitializeRequest,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import { TOOLS } from './tools.js';
import { oauthProvider } from './auth.js';
import {
  searchContacts,
  getContact,
  addContact,
  updateContact,
  logInteraction,
  editInteraction,
  getRecentInteractions,
  getMentionedNextSteps,
  getTags,
  manageTags,
  deleteInteraction,
  deleteContact,
} from './handlers.js';

// ── Tool dispatch ────────────────────────────────────────────────────
const toolHandlers: Record<string, (args: any) => Promise<any>> = {
  search_contacts: searchContacts,
  get_contact: getContact,
  add_contact: addContact,
  update_contact: updateContact,
  log_interaction: logInteraction,
  edit_interaction: editInteraction,
  get_recent_interactions: getRecentInteractions,
  get_mentioned_next_steps: getMentionedNextSteps,
  get_tags: getTags,
  manage_tags: manageTags,
  delete_interaction: deleteInteraction,
  delete_contact: deleteContact,
};

// ── Create MCP server instance ───────────────────────────────────────
function createMcpServer(): Server {
  const server = new Server(
    { name: 'personal-crm', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  // List tools — return raw JSON Schema definitions directly
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  // Call tool — dispatch to handler functions
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handler = toolHandlers[name];

    if (!handler) {
      return {
        content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    try {
      const result = await handler(args ?? {});
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  });

  return server;
}

// ── Express app ──────────────────────────────────────────────────────
const app = express();

// Cloud Run sits behind a load balancer — trust proxy headers
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
  resourceServerUrl: mcpServerUrl,
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

// Helper: create a new transport + server pair
function createTransportAndServer(): StreamableHTTPServerTransport {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => `crm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    onsessioninitialized: (sid) => {
      transports.set(sid, transport);
      console.log(`Session initialized: ${sid}`);
    },
  });

  transport.onclose = () => {
    const sid = transport.sessionId;
    if (sid) {
      transports.delete(sid);
      console.log(`Session closed: ${sid}`);
    }
  };

  const server = createMcpServer();
  server.connect(transport);

  return transport;
}

// MCP POST handler
app.post('/mcp', authMiddleware, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  const isInit = isInitializeRequest(req.body);
  console.log(`POST /mcp sessionId=${sessionId ?? 'none'} isInit=${isInit} hasSession=${sessionId ? transports.has(sessionId) : 'n/a'} activeSessions=${transports.size} method=${req.body?.method ?? 'unknown'}`);

  try {
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports.has(sessionId)) {
      // Existing session — reuse it
      transport = transports.get(sessionId)!;
    } else if (isInit) {
      // New initialize request — create fresh session
      transport = createTransportAndServer();
    } else if (sessionId && !transports.has(sessionId)) {
      // Stale session ID (container restarted) — create a new session
      // and handle the request directly, returning the result with a new session ID
      console.log(`Stale session ${sessionId}, creating new session for ${req.body?.method}`);
      transport = createTransportAndServer();

      // We need to initialize the transport first before it can handle other requests.
      // Send a synthetic initialize, then handle the actual request.
      // Instead, handle it as a stateless one-shot: process the tool call directly.
      const method = req.body?.method;
      if (method === 'tools/call') {
        const { name, arguments: args } = req.body.params ?? {};
        const handler = toolHandlers[name];
        if (!handler) {
          res.json({ jsonrpc: '2.0', error: { code: -32601, message: `Unknown tool: ${name}` }, id: req.body.id });
          return;
        }
        try {
          const result = await handler(args ?? {});
          res.json({
            jsonrpc: '2.0',
            result: {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            },
            id: req.body.id,
          });
        } catch (err: any) {
          res.json({
            jsonrpc: '2.0',
            result: {
              content: [{ type: 'text', text: `Error: ${err.message}` }],
              isError: true,
            },
            id: req.body.id,
          });
        }
        return;
      } else if (method === 'tools/list') {
        res.json({
          jsonrpc: '2.0',
          result: { tools: TOOLS },
          id: req.body.id,
        });
        return;
      } else {
        // For any other method with a stale session, ask client to re-initialize
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Session expired. Please re-initialize.' },
          id: req.body.id ?? null,
        });
        return;
      }
    } else {
      console.log(`POST /mcp rejected: no session ID and not an init request. method=${req.body?.method}`);
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
        id: req.body?.id ?? null,
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
