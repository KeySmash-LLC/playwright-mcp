import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const CLI_PATH = '/home/electron/projects/explorer-workspace/playwright-mcp/packages/playwright-mcp-multiplexer/dist/cli.js';
const USER_DATA_DIR = '/home/electron/.config/chrome-automation';

const transport = new StdioClientTransport({
  command: 'node',
  args: [
    CLI_PATH,
    '--browser=chrome',
    '--executable-path=/usr/bin/google-chrome-stable',
    `--user-data-dir=${USER_DATA_DIR}`,
  ],
  stderr: 'inherit',
});

const client = new Client({ name: 'snapshot-test', version: '1.0.0' });

try {
  await client.connect(transport);
  await client.ping();
  console.log('✓ Connected');

  const createResult = await client.callTool({
    name: 'instance_create',
    arguments: { headless: true, domState: false },
  });
  const text = createResult.content[0].text;
  const instanceId = text.match(/inst-\d+/)?.[0];
  console.log('✓ Instance created:', instanceId);

  console.log('Navigating to https://example.com...');
  const navResult = await client.callTool({
    name: 'browser_navigate',
    arguments: { instanceId, url: 'https://example.com' },
  });
  console.log('Nav result:', navResult.content[0]?.text?.substring(0, 200));

  console.log('Taking snapshot...');
  const snap = await client.callTool({
    name: 'browser_snapshot',
    arguments: { instanceId },
  });
  console.log('Snapshot:', snap.content[0]?.text?.substring(0, 500));

  await client.callTool({ name: 'instance_close', arguments: { instanceId } });
} catch (e) {
  console.error('✗ Error:', e.message);
} finally {
  await client.close().catch(() => {});
  process.exit(0);
}
