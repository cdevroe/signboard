const assert = require('assert');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');

const {
  clearAiCredential,
  getAiCredential,
  getAiCredentialStatus,
  getAiCredentialsPath,
  setAiCredential,
} = require('../lib/aiCredentials');

async function run() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-ai-credentials-'));
  const encrypt = async (value) => Buffer.from(`protected:${value}`).toString('base64');
  const decrypt = async (value) => Buffer.from(value, 'base64').toString('utf8').replace(/^protected:/, '');

  try {
    assert.deepStrictEqual(await getAiCredentialStatus(tmpDir), {
      openai: false,
      gemini: false,
      anthropic: false,
    });

    const status = await setAiCredential(tmpDir, 'openai', 'sk-test-secret', { encrypt });
    assert.deepStrictEqual(status, {
      openai: true,
      gemini: false,
      anthropic: false,
    });
    assert.strictEqual(await getAiCredential(tmpDir, 'openai', { decrypt }), 'sk-test-secret');

    const stored = await fs.readFile(getAiCredentialsPath(tmpDir), 'utf8');
    assert(!stored.includes('sk-test-secret'), 'The credential file must not contain plaintext API keys.');
    if (process.platform !== 'win32') {
      const stat = await fs.stat(getAiCredentialsPath(tmpDir));
      assert.strictEqual(stat.mode & 0o777, 0o600);
    }

    await setAiCredential(tmpDir, 'anthropic', 'sk-ant-test', { encrypt });
    assert.deepStrictEqual(await getAiCredentialStatus(tmpDir), {
      openai: true,
      gemini: false,
      anthropic: true,
    });

    await clearAiCredential(tmpDir, 'openai');
    assert.strictEqual(await getAiCredential(tmpDir, 'openai', { decrypt }), '');
    assert.deepStrictEqual(await getAiCredentialStatus(tmpDir), {
      openai: false,
      gemini: false,
      anthropic: true,
    });

    await assert.rejects(
      setAiCredential(tmpDir, 'openrouter', 'secret', { encrypt }),
      /Unsupported cloud AI provider/,
    );
    await assert.rejects(
      setAiCredential(tmpDir, 'gemini', 'secret-without-encryption'),
      /Secure credential storage is unavailable/,
    );

    console.log('AI credential tests passed.');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error('AI credential tests failed.');
  console.error(error);
  process.exitCode = 1;
});
