import path from 'node:path';
import fs from 'node:fs';
import type { ManagedInstance } from './types.js';

export class AuthManager {
  private authDir: string;

  constructor(authDir: string) {
    this.authDir = authDir;
  }

  async exportState(instance: ManagedInstance, savePath?: string): Promise<string> {
    let outputPath: string;
    if (savePath) {
      // Validate savePath is within the configured auth directory to prevent path traversal.
      // Resolve both paths to canonical absolute paths before comparing so that relative
      // segments like "../../../etc" are fully collapsed before the check.
      const resolved = path.resolve(savePath);
      const authDirResolved = path.resolve(this.authDir);
      // Allow the path to equal authDir exactly, or to be a file inside it.
      // The `+ path.sep` suffix prevents a prefix like `/home/user/.auth-evil`
      // from passing a naive startsWith check against `/home/user/.auth`.
      if (resolved !== authDirResolved && !resolved.startsWith(authDirResolved + path.sep)) {
        throw new Error(
          `savePath must be within the auth directory (${this.authDir}). Got: ${savePath}`
        );
      }
      outputPath = resolved;
    } else {
      outputPath = await this.generateOutputPath(instance.id);
    }

    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

    // Use browser_run_code with storageState({ path }) to save directly to file.
    // This is the most reliable method — Playwright writes the JSON file directly.
    const escapedPath = outputPath.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    await instance.client.callTool({
      name: 'browser_run_code',
      arguments: {
        code: `await page.context().storageState({ path: '${escapedPath}' })`,
      },
    });

    // Verify the file was written
    try {
      const content = await fs.promises.readFile(outputPath, 'utf-8');
      JSON.parse(content); // validate it's valid JSON
    } catch (error) {
      throw new Error(`Failed to export storage state: file was not written or is invalid (${error instanceof Error ? error.message : String(error)})`);
    }

    // Set restrictive permissions
    await fs.promises.chmod(outputPath, 0o600);

    return outputPath;
  }

  private async generateOutputPath(instanceId: string): Promise<string> {
    await fs.promises.mkdir(this.authDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(this.authDir, `state-${instanceId}-${timestamp}.json`);
  }
}
