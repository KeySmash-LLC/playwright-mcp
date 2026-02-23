import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const CLI_PATH = '/home/electron/projects/explorer-workspace/playwright-mcp/packages/playwright-mcp-multiplexer/dist/cli.js';
const USER_DATA_DIR = '/home/electron/.config/chrome-automation';

const transport = new StdioClientTransport({
  command: 'node',
  args: [
    CLI_PATH,
    '--browser=chrome',
    '--headed',
    '--executable-path=/usr/bin/google-chrome-stable',
    `--user-data-dir=${USER_DATA_DIR}`,
  ],
  stderr: 'inherit',  // show Chrome stderr directly
});

const client = new Client({ name: 'profile-copy-headed-test', version: '1.0.0' });

try {
  await client.connect(transport);
  await client.ping();
  console.log('✓ Multiplexer connected (HEADED profile-copy mode)');

  const createResult = await client.callTool({
    name: 'instance_create',
    arguments: { headless: false, domState: false },
  });
  const text = createResult.content[0].text;
  const instanceId = text.match(/inst-\d+/)?.[0];
  console.log('✓ Instance created:', instanceId);

  console.log('\nNavigating to Google...');
  await client.callTool({
    name: 'browser_navigate',
    arguments: { instanceId, url: 'https://accounts.google.com/ServiceLogin' },
  });
  await new Promise(r => setTimeout(r, 4000));

  console.log('Navigating to LinkedIn...');
  await client.callTool({
    name: 'browser_navigate',
    arguments: { instanceId, url: 'https://www.linkedin.com/feed/' },
  });
  await new Promise(r => setTimeout(r, 4000));

  console.log('Holding open 30s — check your screen...');
  await new Promise(r => setTimeout(r, 30000));

  await client.callTool({ name: 'instance_close', arguments: { instanceId } });
  console.log('✓ Done.');
} catch (e) {
  console.error('✗ Error:', e.message);
} finally {
  await client.close().catch(() => {});
  process.exit(0);
}
