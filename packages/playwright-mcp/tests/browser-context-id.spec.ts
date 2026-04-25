/**
 * Smoke tests for the --browser-context-id flag surface.
 *
 * TICKET-SUBSESS-009: Pass --browser-context-id through @playwright/mcp package wrapper.
 *
 * These tests verify that the public package CLI correctly surfaces the
 * --browser-context-id flag added in TICKET-SUBSESS-003. Deep behaviour is
 * covered in 003 and 008; this file tests surface honesty only.
 *
 * If a real Chromium is unavailable in CI, the --help parse test and the
 * validation test alone satisfy the acceptance criteria. The polling test
 * (flag_with_fake_id_polls_then_errors) requires a live CDP server and will
 * be skipped automatically on non-Chromium browser projects.
 */

import child_process from 'child_process';
import path from 'path';

import { test, expect } from './fixtures';

const cliBin = path.join(__dirname, '../cli.js');

/**
 * help_lists_flag
 *
 * Spawns the package binary with --help and verifies that --browser-context-id
 * appears in the output. This is the primary surface-honesty check.
 */
test('help_lists_flag', async () => {
  const result = child_process.spawnSync(process.execPath, [cliBin, '--help'], {
    encoding: 'utf-8',
    timeout: 10_000,
  });
  expect(result.stdout).toContain('--browser-context-id');
});

/**
 * flag_validation_propagates
 *
 * Spawns with --browser-context-id=BC123 but no --cdp-endpoint.
 * Verifies that the upstream validation from TICKET-SUBSESS-003 surfaces
 * through the package wrapper: exit code 1, error message on stderr.
 */
test('flag_validation_propagates', async () => {
  const result = child_process.spawnSync(
      process.execPath,
      [cliBin, '--browser-context-id=BC123'],
      {
        encoding: 'utf-8',
        timeout: 10_000,
      }
  );
  expect(result.status).toBe(1);
  // The error is written to stdout by commander (process.stderr in program.ts)
  const combinedOutput = result.stdout + result.stderr;
  expect(combinedOutput).toContain('--browser-context-id requires --cdp-endpoint');
});

/**
 * flag_with_fake_id_polls_then_errors
 *
 * Connects to a live CDP server (real Chromium), passes a fake browser context
 * id, then calls a tool. The factory polls up to 5 times (100ms apart) and
 * throws when no matching context is found. The tool call returns isError=true
 * with the not-found message.
 *
 * This test requires a Chromium-family browser and is skipped otherwise.
 */
test('flag_with_fake_id_polls_then_errors', async ({ startClient, cdpServer }) => {
  // cdpServer fixture skips automatically for non-Chromium projects.
  await cdpServer.start();

  const { client } = await startClient({
    args: [
      `--cdp-endpoint=${cdpServer.endpoint}`,
      '--browser-context-id=BC_FAKE_DOES_NOT_EXIST',
    ],
  });

  // Trigger context creation by calling a navigation tool. The factory will
  // poll 5×100ms, then throw the not-found error, which surfaces as an
  // isError MCP response.
  //
  // Note: browser_tabs list swallows the context-creation error (by design —
  // an empty allow-list produces the same outcome). Use browser_navigate
  // instead so the rejection propagates to the MCP response.
  const result = await client.callTool({
    name: 'browser_navigate',
    arguments: { url: 'about:blank' },
  });

  expect(result.isError).toBe(true);
  const text = (result.content[0] as { type: string; text: string }).text;
  expect(text).toContain('--browser-context-id');
  expect(text).toContain('not found');
});
