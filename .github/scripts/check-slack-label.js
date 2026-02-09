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

let notify = 'false';
const prNum = parseInt(process.env.PR_NUM || '0', 10);
if (process.env.SLACK_WEBHOOK && prNum) {
  const { data: pr } = await github.rest.pulls.get({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: prNum,
  });
  const label = process.env.SLACK_NOTIFY_LABEL || 'slack-notify';
  if (pr.labels.some(l => l.name === label)) {
    notify = 'true';
  }
}
core.setOutput('notify', notify);
