/**
 * Docker Build PR Comment Formatter
 *
 * Generates a markdown PR comment showing which Docker services will be built.
 *
 * Environment variables:
 *   SERVICES        - Space-separated list of services to build
 *   SERVICES_CONFIG - JSON config mapping services to ECR repo names
 *   CHANGED_FILES   - List of changed files
 *   SERVICES_FOLDER - Top-level folder containing service subfolders
 *   COMMIT_SHA      - Full commit SHA
 *   SHARED_PATHS    - Space-separated shared paths that trigger all rebuilds
 *
 * Output: Sets 'body' output via core.setOutput (for use with actions/github-script)
 */

const services = (process.env.SERVICES || '').trim();
const servicesConfig = JSON.parse(process.env.SERVICES_CONFIG || '{}');
const changedFiles = (process.env.CHANGED_FILES || '').trim();
const servicesFolder = process.env.SERVICES_FOLDER;
const commitSha = process.env.COMMIT_SHA.substring(0, 7);

const lines = [];
lines.push('## 🐳 Docker Build Preview');
lines.push('');

if (!services) {
  lines.push(`✅ No changes detected in \`${servicesFolder}/\` - no images will be built.`);
} else {
  const serviceList = services.split(/\s+/);
  lines.push(`**${serviceList.length} service(s) will be built on merge:**`);
  lines.push('');
  lines.push('| Service | Staging Image | Production Image |');
  lines.push('|---------|---------------|------------------|');
  for (const svc of serviceList) {
    const config = servicesConfig[svc] || {};
    const stagingImage = config.staging || '(not configured)';
    const prodImage = config.production || '(not configured)';
    lines.push(`| \`${svc}\` | \`${stagingImage}\` | \`${prodImage}\` |`);
  }
  lines.push('');
  lines.push(`> Tags: \`:latest\` and \`:${commitSha}\``);
  lines.push('');
}

if (changedFiles && changedFiles !== '(build-all requested)') {
  const sharedPaths = process.env.SHARED_PATHS || '';
  const isSharedTrigger = sharedPaths && changedFiles.split('\n').some(f =>
    sharedPaths.split(/\s+/).some(sp => f.startsWith(sp.replace(/\/$/, '')))
  );

  if (isSharedTrigger) {
    lines.push('> ⚠️ **Shared code changed** - all services will be rebuilt');
    lines.push('');
  }

  lines.push('<details>');
  lines.push('<summary>Changed files</summary>');
  lines.push('');
  lines.push('```');
  lines.push(changedFiles);
  lines.push('```');
  lines.push('</details>');
}

lines.push('');
lines.push('---');
lines.push(`<sub>Services folder: \`${servicesFolder}/\`</sub>`);

// Output for actions/github-script
core.setOutput('body', lines.join('\n'));
