import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const CLI_PATH = '/home/electron/projects/explorer-workspace/playwright-mcp/packages/playwright-mcp-multiplexer/dist/cli.js';
const USER_DATA_DIR = '/home/electron/.config/chrome-automation';

const transport = new StdioClientTransport({
  command: 'node',
  args: [CLI_PATH, '--browser=chrome', '--executable-path=/usr/bin/google-chrome-stable', `--user-data-dir=${USER_DATA_DIR}`],
  stderr: 'pipe',
});

const client = new Client({ name: 'auth-check', version: '1.0.0' });
await client.connect(transport);
await client.ping();

const create = await client.callTool({ name: 'instance_create', arguments: { headless: true, domState: false } });
const instanceId = create.content[0].text.match(/inst-\d+/)?.[0];
console.log('Instance:', instanceId);

// Check LinkedIn - should show feed if logged in
await client.callTool({ name: 'browser_navigate', arguments: { instanceId, url: 'https://www.linkedin.com/feed/' } });
const snap = await client.callTool({ name: 'browser_snapshot', arguments: { instanceId } });
const text = snap.content[0]?.text ?? '';
const isLoggedIn = text.includes('feed') && !text.includes('Sign in') && !text.includes('login');
console.log('LinkedIn authenticated:', isLoggedIn ? 'YES ✓' : 'NO (login required)');
if (!isLoggedIn) console.log('Snapshot excerpt:', text.substring(0, 300));

await client.callTool({ name: 'instance_close', arguments: { instanceId } });
await client.close().catch(() => {});
process.exit(0);
