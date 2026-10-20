import { describe, expect, it } from 'vitest';
import type { ClassifyOptions } from '../src/classify.ts';
import { classify } from '../src/classify.ts';

function makeOptions(overrides: Partial<ClassifyOptions> = {}): ClassifyOptions {
  return {
    title: '',
    body: '',
    bugLabel: 'bug',
    featureLabel: 'feature-request',
    extraBugSignals: [],
    extraFeatureSignals: [],
    threshold: 2,
    ...overrides,
  };
}

describe('classify', () => {
  it('classifies issue with bug language as bug', () => {
    const result = classify(
      makeOptions({
        title: 'S3 getObject throws timeout exception on large files',
        body: 'After upgrading, the ResponseInputStream crashes with a timeout exception. This is a regression from 2.24. Expected behavior: download completes.',
      }),
    );
    expect(result.label).toBe('bug');
    expect(result.bugScore).toBeGreaterThan(result.frScore);
  });

  it('classifies issue with feature-request language as feature-request', () => {
    const result = classify(
      makeOptions({
        title: 'Add support for configurable retry backoff strategy',
        body: 'It would be nice to have the ability to configure custom retry backoff strategies. Use case: we need exponential backoff. Proposed solution: allow users to pass a custom BackoffStrategy.',
      }),
    );
    expect(result.label).toBe('feature-request');
    expect(result.frScore).toBeGreaterThan(result.bugScore);
  });

  it('returns null label when content is ambiguous', () => {
    const result = classify(
      makeOptions({
        title: 'DynamoDB endpoint resolution is slow for static endpoints',
        body: 'When using a static endpoint override, the SDK still re-evaluates the endpoint rules engine on every request.',
      }),
    );
    expect(result.label).toBeNull();
  });

  it('weights title signals at 3x', () => {
    const result = classify(
      makeOptions({
        title: 'error timeout crash',
        body: '',
      }),
    );
    // 3 title bug signals × 3 = 9
    expect(result.bugScore).toBe(9);
  });

  it('weights body signals at 1x', () => {
    const result = classify(
      makeOptions({
        title: '',
        body: 'exception timeout regression',
      }),
    );
    // 3 body bug signals × 1 = 3
    expect(result.bugScore).toBe(3);
  });

  it('respects custom threshold', () => {
    const result = classify(
      makeOptions({
        title: 'error',
        body: '',
        threshold: 10,
      }),
    );
    // bugScore = 3 (title signal), frScore = 0, diff = 3 < threshold 10
    expect(result.label).toBeNull();
  });

  it('uses extra bug signals from configuration', () => {
    const result = classify(
      makeOptions({
        title: '',
        body: 'got a nullpointer in the SDK',
        extraBugSignals: ['nullpointer'],
      }),
    );
    expect(result.bugScore).toBeGreaterThan(0);
  });

  it('uses extra feature signals from configuration', () => {
    const result = classify(
      makeOptions({
        title: '',
        body: 'please add coroutine support',
        extraFeatureSignals: ['coroutine'],
      }),
    );
    expect(result.frScore).toBeGreaterThan(0);
  });

  it('uses custom bug-label name', () => {
    const result = classify(
      makeOptions({
        title: 'throws exception on startup',
        body: 'The SDK crashes with a regression after upgrade. Stack trace attached.',
        bugLabel: 'type:bug',
      }),
    );
    expect(result.label).toBe('type:bug');
  });

  it('uses custom feature-label name', () => {
    const result = classify(
      makeOptions({
        title: 'Add support for new API',
        body: 'Describe the feature: It would be nice to have this ability to call the new endpoint. Proposed solution: add a new method.',
        featureLabel: 'type:enhancement',
      }),
    );
    expect(result.label).toBe('type:enhancement');
  });

  it('is case-insensitive', () => {
    const result = classify(
      makeOptions({
        title: 'THROWS EXCEPTION',
        body: 'REGRESSION after UPGRADE. EXPECTED BEHAVIOR: should work.',
      }),
    );
    expect(result.bugScore).toBeGreaterThan(0);
    expect(result.label).toBe('bug');
  });

  it('handles empty title and body', () => {
    const result = classify(makeOptions({ title: '', body: '' }));
    expect(result.label).toBeNull();
    expect(result.bugScore).toBe(0);
    expect(result.frScore).toBe(0);
  });
});
