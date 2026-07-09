import * as core from '@actions/core';
import * as github from '@actions/github';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@actions/core');
vi.mock('@actions/github');

const { run } = await import('../src/main.ts');

const addLabels = vi.fn();
const createComment = vi.fn();
const listLabelsForRepo = vi.fn();
const paginate = vi.fn();

function setInputs({ labels = ['bug'], message = '', token = 't' } = {}) {
  vi.mocked(core.getInput).mockImplementation((name) => (name === 'message' ? message : name === 'token' ? token : ''));
  vi.mocked(core.getMultilineInput).mockReturnValue(labels);
}

type ContextOpts = { eventName?: string; action?: string; issue?: { number: number; labels?: unknown[] } | undefined };

function setContext(opts: ContextOpts = {}) {
  const eventName = opts.eventName ?? 'issues';
  const action = opts.action ?? 'opened';
  const issue = 'issue' in opts ? opts.issue : { number: 7, labels: [] };
  Object.defineProperty(github, 'context', {
    configurable: true,
    value: {
      eventName,
      payload: { action, issue },
      repo: { owner: 'octo', repo: 'demo' },
    },
  });
}

function setRepoLabels(names: string[]) {
  paginate.mockResolvedValue(names.map((name) => ({ name })));
}

beforeEach(() => {
  vi.mocked(github.getOctokit).mockReturnValue({
    paginate,
    rest: { issues: { addLabels, createComment, listLabelsForRepo } },
  } as unknown as ReturnType<typeof github.getOctokit>);
  setInputs();
  setContext();
  setRepoLabels(['bug', 'enhancement']);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('run', () => {
  it('applies requested labels to a new unlabeled issue', async () => {
    await run();
    expect(addLabels).toHaveBeenCalledWith({ owner: 'octo', repo: 'demo', issue_number: 7, labels: ['bug'] });
    expect(createComment).not.toHaveBeenCalled();
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('ignores events that are not newly opened issues', async () => {
    setContext({ action: 'edited' });
    await run();
    expect(github.getOctokit).not.toHaveBeenCalled();
  });

  it('ignores non-issue events', async () => {
    setContext({ eventName: 'push' });
    await run();
    expect(github.getOctokit).not.toHaveBeenCalled();
  });

  it('does nothing when the payload has no issue', async () => {
    setContext({ issue: undefined });
    await run();
    expect(github.getOctokit).not.toHaveBeenCalled();
  });

  it('skips issues that already have labels', async () => {
    setContext({ issue: { number: 7, labels: [{ name: 'triage' }] } });
    await run();
    expect(addLabels).not.toHaveBeenCalled();
  });

  it('warns about and skips labels that do not exist, applying the rest', async () => {
    setInputs({ labels: ['bug', 'ghost'] });
    await run();
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('"ghost"'));
    expect(addLabels).toHaveBeenCalledWith({ owner: 'octo', repo: 'demo', issue_number: 7, labels: ['bug'] });
  });

  it('warns and applies nothing when no requested label exists', async () => {
    setInputs({ labels: ['ghost'] });
    await run();
    expect(addLabels).not.toHaveBeenCalled();
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('no labels applied'));
  });

  it('posts a comment when a message input is provided', async () => {
    setInputs({ message: 'Thanks for filing!' });
    await run();
    expect(createComment).toHaveBeenCalledWith({
      owner: 'octo',
      repo: 'demo',
      issue_number: 7,
      body: 'Thanks for filing!',
    });
  });

  it('does not comment when no message is provided', async () => {
    await run();
    expect(createComment).not.toHaveBeenCalled();
  });

  it('trims and drops blank label lines', async () => {
    setInputs({ labels: ['  bug  ', '', '   '] });
    await run();
    expect(addLabels).toHaveBeenCalledWith({ owner: 'octo', repo: 'demo', issue_number: 7, labels: ['bug'] });
  });

  it('emits debug detail in debug mode', async () => {
    await run();
    expect(core.debug).toHaveBeenCalled();
  });

  it('propagates errors for the entrypoint to handle', async () => {
    paginate.mockRejectedValue(new Error('boom'));
    await expect(run()).rejects.toThrow('boom');
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('treats a missing labels field as unlabeled', async () => {
    setContext({ issue: { number: 7 } });
    await run();
    expect(addLabels).toHaveBeenCalledWith({ owner: 'octo', repo: 'demo', issue_number: 7, labels: ['bug'] });
  });
});
