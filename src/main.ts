import * as core from '@actions/core';
import * as github from '@actions/github';
import { classify } from './classify.js';

export async function run(): Promise<void> {
  const token = core.getInput('token', { required: true });
  const requestedLabels = core
    .getMultilineInput('labels', { required: true })
    .map((label) => label.trim())
    .filter(Boolean);
  const message = core.getInput('message').trim();

  // Classification inputs
  const classifyEnabled = core.getInput('classify').trim().toLowerCase() === 'true';
  const bugLabel = core.getInput('bug-label').trim() || 'bug';
  const featureLabel = core.getInput('feature-label').trim() || 'feature-request';
  const extraBugSignals = core
    .getMultilineInput('extra-bug-signals')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const extraFeatureSignals = core
    .getMultilineInput('extra-feature-signals')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const threshold = Number.parseInt(core.getInput('classification-threshold') || '2', 10) || 2;

  const { eventName, payload } = github.context;
  core.debug(`Triggered by event "${eventName}" with action "${payload.action}".`);

  if (eventName !== 'issues' || payload.action !== 'opened') {
    core.info('Not a new issue event; nothing to do.');
    return;
  }

  const issue = payload.issue;
  if (!issue) {
    core.info('Event payload has no issue; nothing to do.');
    return;
  }

  const existingLabels: unknown[] = issue.labels ?? [];
  core.debug(`Issue #${issue.number} has ${existingLabels.length} existing label(s).`);
  if (existingLabels.length > 0) {
    core.info(`Issue #${issue.number} is already labeled; nothing to do.`);
    return;
  }

  const { owner, repo } = github.context.repo;
  const octokit = github.getOctokit(token);

  const repoLabels = await octokit.paginate(octokit.rest.issues.listLabelsForRepo, { owner, repo });
  const repoLabelNames = new Set(repoLabels.map((label) => label.name));
  core.debug(`Repository ${owner}/${repo} defines labels: ${[...repoLabelNames].join(', ')}.`);

  // Build the full list of labels to apply
  const allRequestedLabels = [...requestedLabels];

  // Classification
  if (classifyEnabled) {
    const title = (issue.title as string) ?? '';
    const body = (issue.body as string) ?? '';
    const result = classify({ title, body, bugLabel, featureLabel, extraBugSignals, extraFeatureSignals, threshold });
    core.debug(`Classification scores — bug: ${result.bugScore}, feature: ${result.frScore}.`);
    if (result.label) {
      allRequestedLabels.push(result.label);
      core.info(`Classified issue as "${result.label}".`);
    } else {
      core.info('Classification inconclusive; no category label applied.');
    }
  }

  const labelsToApply = allRequestedLabels.filter((label) => repoLabelNames.has(label));
  for (const label of allRequestedLabels.filter((label) => !repoLabelNames.has(label))) {
    core.warning(`Label "${label}" does not exist in ${owner}/${repo}; skipping it.`);
  }

  if (labelsToApply.length > 0) {
    await octokit.rest.issues.addLabels({ owner, repo, issue_number: issue.number, labels: labelsToApply });
    core.info(`Applied label(s) to issue #${issue.number}: ${labelsToApply.join(', ')}.`);
  } else {
    core.warning('None of the requested labels exist in the repository; no labels applied.');
  }

  if (message) {
    await octokit.rest.issues.createComment({ owner, repo, issue_number: issue.number, body: message });
    core.info(`Posted comment on issue #${issue.number}.`);
  }
}
