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

function setInputs({
  labels = ['bug'],
  message = '',
  token = 't',
  classify = 'false',
  bugLabel = 'bug',
  featureLabel = 'feature-request',
  extraBugSignals = [] as string[],
  extraFeatureSignals = [] as string[],
  classificationThreshold = '2',
} = {}) {
  vi.mocked(core.getInput).mockImplementation((name) => {
    switch (name) {
      case 'message':
        return message;
      case 'token':
        return token;
      case 'classify':
        return classify;
      case 'bug-label':
        return bugLabel;
      case 'feature-label':
        return featureLabel;
      case 'classification-threshold':
        return classificationThreshold;
      default:
        return '';
    }
  });
  vi.mocked(core.getMultilineInput).mockImplementation((name) => {
    switch (name) {
      case 'labels':
        return labels;
      case 'extra-bug-signals':
        return extraBugSignals;
      case 'extra-feature-signals':
        return extraFeatureSignals;
      default:
        return [];
    }
  });
}

type ContextOpts = {
  eventName?: string;
  action?: string;
  issue?: { number: number; labels?: unknown[]; title?: string; body?: string } | undefined;
};

function setContext(opts: ContextOpts = {}) {
  const eventName = opts.eventName ?? 'issues';
  const action = opts.action ?? 'opened';
  const issue = 'issue' in opts ? opts.issue : { number: 7, labels: [], title: '', body: '' };
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
  setRepoLabels(['bug', 'feature-request', 'needs-triage', 'enhancement']);
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
    setContext({ issue: { number: 7, labels: [{ name: 'triage' }], title: '', body: '' } });
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
    setContext({ issue: { number: 7, title: '', body: '' } });
    await run();
    expect(addLabels).toHaveBeenCalledWith({ owner: 'octo', repo: 'demo', issue_number: 7, labels: ['bug'] });
  });
});

describe('run with classification enabled', () => {
  it('adds bug label when issue has bug-like content', async () => {
    setInputs({ labels: ['needs-triage'], classify: 'true' });
    setContext({
      issue: {
        number: 10,
        labels: [],
        title: 'S3 getObject throws timeout exception',
        body: 'After upgrade, the SDK crashes with a regression. Expected behavior: should work.',
      },
    });
    await run();
    expect(addLabels).toHaveBeenCalledWith({
      owner: 'octo',
      repo: 'demo',
      issue_number: 10,
      labels: ['needs-triage', 'bug'],
    });
  });

  it('adds feature-request label when issue has FR-like content', async () => {
    setInputs({ labels: ['needs-triage'], classify: 'true' });
    setContext({
      issue: {
        number: 11,
        labels: [],
        title: 'Add support for custom retry strategy',
        body: 'It would be nice to have the ability to configure this. Use case: high throughput. Proposed solution: add builder option.',
      },
    });
    await run();
    expect(addLabels).toHaveBeenCalledWith({
      owner: 'octo',
      repo: 'demo',
      issue_number: 11,
      labels: ['needs-triage', 'feature-request'],
    });
  });

  it('does not add category label when content is ambiguous', async () => {
    setInputs({ labels: ['needs-triage'], classify: 'true' });
    setContext({
      issue: {
        number: 12,
        labels: [],
        title: 'SDK performance degrades with many requests',
        body: 'Throughput drops when making concurrent calls.',
      },
    });
    await run();
    expect(addLabels).toHaveBeenCalledWith({
      owner: 'octo',
      repo: 'demo',
      issue_number: 12,
      labels: ['needs-triage'],
    });
  });

  it('does not classify when classify is false', async () => {
    setInputs({ labels: ['needs-triage'], classify: 'false' });
    setContext({
      issue: {
        number: 13,
        labels: [],
        title: 'S3 throws exception on upload',
        body: 'Regression after upgrade. Stack trace attached.',
      },
    });
    await run();
    expect(addLabels).toHaveBeenCalledWith({
      owner: 'octo',
      repo: 'demo',
      issue_number: 13,
      labels: ['needs-triage'],
    });
  });

  it('skips classification label if it does not exist in repo', async () => {
    setInputs({ labels: ['needs-triage'], classify: 'true', bugLabel: 'type:bug' });
    setRepoLabels(['needs-triage']); // type:bug not in repo
    setContext({
      issue: {
        number: 14,
        labels: [],
        title: 'throws exception on crash',
        body: 'regression after upgrade',
      },
    });
    await run();
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('"type:bug"'));
    expect(addLabels).toHaveBeenCalledWith({
      owner: 'octo',
      repo: 'demo',
      issue_number: 14,
      labels: ['needs-triage'],
    });
  });

  it('uses extra bug signals from configuration', async () => {
    setInputs({ labels: ['needs-triage'], classify: 'true', extraBugSignals: ['nullpointer'] });
    setContext({
      issue: {
        number: 15,
        labels: [],
        title: 'SDK throws exception on putObject',
        body: 'Got a nullpointer when calling putObject. Stack trace shows a crash in the SDK.',
      },
    });
    await run();
    expect(addLabels).toHaveBeenCalledWith({
      owner: 'octo',
      repo: 'demo',
      issue_number: 15,
      labels: ['needs-triage', 'bug'],
    });
  });
});
