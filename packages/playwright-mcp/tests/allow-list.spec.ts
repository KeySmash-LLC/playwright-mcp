/**
 * End-to-end tests for the MCP allow-list patch.
 * Derived from TICKET-SUBSESS-004-TEST:
 *   - fork_works_unchanged_when_set_never_called
 *   - set_allowed_then_set_empty_locks_out_existing_session
 */

import { test, expect } from './fixtures';

/**
 * fork_works_unchanged_when_set_never_called
 *
 * Spawns the MCP child without ever calling tabs_set_allowed.
 * browser_tabs list should work normally — backwards compatible.
 */
test('fork_works_unchanged_when_set_never_called', async ({ client, server }) => {
  // Navigate to a page first
  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.HELLO_WORLD },
  });

  // Call browser_tabs list — should succeed without error
  const result = await client.callTool({
    name: 'browser_tabs',
    arguments: { action: 'list' },
  });

  expect(result.isError).toBeFalsy();
  // Should list at least one tab
  const text = result.content[0].text as string;
  expect(text).toBeTruthy();
});

/**
 * tabs_set_allowed_tool_is_available
 *
 * Verifies the new tabs_set_allowed tool is exposed by the MCP server
 * and can be called without error.
 */
test('tabs_set_allowed_tool_is_available', async ({ client, server }) => {
  // Navigate to a page first
  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.HELLO_WORLD },
  });

  // tabs_set_allowed with a list of target ids should succeed.
  // We don't have a real target_id here, but setting it to an empty
  // list tests that the tool is callable and accepted by the schema.
  const result = await client.callTool({
    name: 'tabs_set_allowed',
    arguments: { target_ids: [] },
  });

  // The tool should respond without an isError condition
  expect(result.isError).toBeFalsy();
  const text = result.content[0].text as string;
  expect(text).toContain('allow-list now:');
});

/**
 * set_allowed_then_set_empty_locks_out_existing_session
 *
 * Defense-in-depth test:
 *   1. Navigate to a page (establishes a tab).
 *   2. tabs_set_allowed with a known target_id would allow it.
 *   3. tabs_set_allowed with [] locks out all tabs.
 *   4. browser_tabs list returns empty after the lock-out.
 *
 * This tests the scenario in the spec where sidecar calls
 * tabs_set_allowed([]) to lock out all tabs.
 */
test('set_allowed_then_set_empty_locks_out_existing_session', async ({ client, server }) => {
  // Navigate to a page to ensure there is a tab
  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.HELLO_WORLD },
  });

  // Verify we can list tabs now (before allow-list initialization)
  const beforeResult = await client.callTool({
    name: 'browser_tabs',
    arguments: { action: 'list' },
  });
  expect(beforeResult.isError).toBeFalsy();

  // Lock out all tabs with an empty allow-list
  const lockResult = await client.callTool({
    name: 'tabs_set_allowed',
    arguments: { target_ids: [] },
  });
  expect(lockResult.isError).toBeFalsy();

  // After setting empty allow-list, browser_tabs list should return no tabs
  const afterResult = await client.callTool({
    name: 'browser_tabs',
    arguments: { action: 'list' },
  });
  expect(afterResult.isError).toBeFalsy();
  const text = afterResult.content[0].text as string;
  // The tab list should be empty — no tabs visible after lock-out
  // The response text should not list any numbered tabs (no "1 |" or similar)
  expect(text).not.toMatch(/^\d+\s*\|/m);
});
