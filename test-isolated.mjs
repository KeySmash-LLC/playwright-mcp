import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const CLI_PATH = '/home/electron/projects/explorer-workspace/playwright-mcp/packages/playwright-mcp-multiplexer/dist/cli.js';
// No user-data-dir = will use --isolated (ephemeral profile)

const transport = new StdioClientTransport({
  command: 'node',
  args: [
    CLI_PATH,
    '--browser=chrome',
    '--headed',
    '--executable-path=/usr/bin/google-chrome-stable',
    // NO --user-data-dir = isolated mode
  ],
  stderr: 'inherit',
});

const client = new Client({ name: 'snapshot-test-isolated', version: '1.0.0' });

try {
  await client.connect(transport);
  await client.ping();
  console.log('✓ Connected');

  const createResult = await client.callTool({
    name: 'instance_create',
    arguments: { headless: false, domState: false },
  });
  const text = createResult.content[0].text;
  const instanceId = text.match(/inst-\d+/)?.[0];
  console.log('✓ Instance created:', instanceId);

  const navResult = await client.callTool({
    name: 'browser_navigate',
    arguments: { instanceId, url: 'https://example.com' },
  });
  console.log('Nav result:', navResult.content[0]?.text?.substring(0, 300));

  await client.callTool({ name: 'instance_close', arguments: { instanceId } });
} catch (e) {
  console.error('✗ Error:', e.message);
} finally {
  await client.close().catch(() => {});
  process.exit(0);
}
