import * as core from '@actions/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@actions/core');
const run = vi.fn();
vi.mock('../src/main.js', () => ({ run }));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe('index', () => {
  it('runs without failing when run resolves', async () => {
    run.mockResolvedValue(undefined);
    await import('../src/index.ts');
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('fails with the original error when run rejects', async () => {
    const error = new Error('boom');
    run.mockRejectedValue(error);
    await import('../src/index.ts');
    expect(core.setFailed).toHaveBeenCalledWith(error);
  });

  it('coerces a non-Error rejection into a string', async () => {
    run.mockRejectedValue('plain string failure');
    await import('../src/index.ts');
    expect(core.setFailed).toHaveBeenCalledWith('plain string failure');
  });
});
