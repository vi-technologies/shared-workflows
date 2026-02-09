/**
 * Check Slack Label
 *
 * Checks if a Slack webhook is configured and if the PR has the
 * slack-notify label. For use with actions/github-script.
 *
 * Environment variables:
 *   SLACK_WEBHOOK       - Slack webhook URL (skip if empty)
 *   PR_NUM              - Pull request number
 *   SLACK_NOTIFY_LABEL  - Label name to check for
 *
 * Outputs:
 *   notify - "true" or "false"
 */

if (!process.env.SLACK_WEBHOOK) { core.setOutput('notify', 'false'); return; }
const prNum = parseInt(process.env.PR_NUM || '0', 10);
if (!prNum) { core.setOutput('notify', 'false'); return; }
const { data: pr } = await github.rest.pulls.get({
  owner: context.repo.owner,
  repo: context.repo.repo,
  pull_number: prNum,
});
const label = process.env.SLACK_NOTIFY_LABEL || 'slack-notify';
core.setOutput('notify', pr.labels.some(l => l.name === label) ? 'true' : 'false');
