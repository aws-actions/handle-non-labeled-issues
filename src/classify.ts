// Built-in universal signals for bug vs feature-request classification
const BUILTIN_BUG_SIGNALS: string[] = [
  'regression',
  'crash',
  'timeout',
  'fails',
  'failure',
  'exception',
  'reproduce',
  'reproduction',
  'expected behavior',
  'current behavior',
  'describe the bug',
  'stack trace',
  'stacktrace',
  'data loss',
  'silent',
  'caused by',
  'incorrect',
  'unexpected',
  'after updating',
  'after upgrade',
  'previously worked',
  'used to work',
];

const BUILTIN_FR_SIGNALS: string[] = [
  'describe the feature',
  'proposed solution',
  'use case',
  'feature request',
  'it would be',
  'would be nice',
  'ability to',
  'add support',
  'option to',
  'consider adding',
  'suggestion',
];

const BUILTIN_BUG_TITLE_SIGNALS: string[] = [
  'throws',
  'fails',
  'error',
  'timeout',
  'cve',
  'crash',
  'broken',
  'regression',
  'incorrect',
  'exception',
];

const BUILTIN_FR_TITLE_SIGNALS: string[] = ['support', 'add', 'allow', 'enable', 'configur'];

export interface ClassifyOptions {
  title: string;
  body: string;
  bugLabel: string;
  featureLabel: string;
  extraBugSignals: string[];
  extraFeatureSignals: string[];
  threshold: number;
}

export interface ClassifyResult {
  label: string | null;
  bugScore: number;
  frScore: number;
}

export function classify(options: ClassifyOptions): ClassifyResult {
  const { title, body, bugLabel, featureLabel, extraBugSignals, extraFeatureSignals, threshold } = options;

  const titleLower = title.toLowerCase();
  const bodyLower = body.toLowerCase();

  const allBugSignals = [...BUILTIN_BUG_SIGNALS, ...extraBugSignals];
  const allFrSignals = [...BUILTIN_FR_SIGNALS, ...extraFeatureSignals];

  let bugScore = 0;
  let frScore = 0;

  // Score body signals (1x weight)
  for (const signal of allBugSignals) {
    if (bodyLower.includes(signal)) bugScore += 1;
  }
  for (const signal of allFrSignals) {
    if (bodyLower.includes(signal)) frScore += 1;
  }

  // Score title signals (3x weight)
  for (const signal of BUILTIN_BUG_TITLE_SIGNALS) {
    if (titleLower.includes(signal)) bugScore += 3;
  }
  for (const signal of BUILTIN_FR_TITLE_SIGNALS) {
    if (titleLower.includes(signal)) frScore += 3;
  }

  const diff = Math.abs(bugScore - frScore);

  let label: string | null = null;
  if (diff >= threshold) {
    label = bugScore > frScore ? bugLabel : featureLabel;
  }

  return { label, bugScore, frScore };
}
