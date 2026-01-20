/**
 * Shared CDK Diff Formatter
 * Used by both cdk-diff.yaml and cdk-deploy.yaml workflows
 * 
 * Usage: node format-cdk-diff.js <diff-json> <context-json>
 * 
 * diff-json: The toolkit-lib diff output
 * context-json: { repo, runUrl, prUrl?, prNum?, isDeployment, actor? }
 */

const getEnv = (n) => n.toLowerCase().includes('prod') ? 'production' : n.toLowerCase().includes('staging') ? 'staging' : 'dev';
const cleanId = (id) => id.replace(/[A-F0-9]{8}$/i, '').replace(/([a-z])([A-Z])/g, '$1 $2');
const shortType = (t) => t.split('::').pop();

function formatMarkdown(data) {
  let md = '## 🔍 CDK Diff\n\n';
  if (!data.success) { 
    return md + `❌ **Error:** ${data.error}\n`; 
  }
  
  const changed = data.stacks.filter(s => s.hasDiff);
  const unchanged = data.stacks.filter(s => !s.hasDiff);
  const adds = data.stacks.reduce((n, s) => n + s.resources.filter(r => r.action === 'ADD').length, 0);
  const updates = data.stacks.reduce((n, s) => n + s.resources.filter(r => r.action === 'UPDATE').length, 0);
  const removes = data.stacks.reduce((n, s) => n + s.resources.filter(r => r.action === 'REMOVE').length, 0);
  
  if (changed.length === 0) { 
    return md + '✅ **No changes**\n'; 
  }
  
  const parts = [];
  if (adds) parts.push(`🟢 ${adds} to add`);
  if (updates) parts.push(`🟡 ${updates} to update`);
  if (removes) parts.push(`🔴 ${removes} to destroy`);
  md += `**${parts.join(' · ')}**\n\n`;
  
  for (const stack of changed) {
    md += `### ${stack.stackName}\n> _${getEnv(stack.stackName)}_`;
    if (stack.drift) md += stack.drift.status === 'DRIFTED' ? ` · ⚠️ drift (${stack.drift.count})` : ' · ✓ no drift';
    md += '\n\n';
    
    const byAction = { ADD: [], UPDATE: [], REMOVE: [] };
    for (const res of stack.resources) byAction[res.action].push(res);
    
    if (byAction.ADD.length) {
      md += '**➕ Create**\n';
      for (const r of byAction.ADD) {
        md += `- \`${shortType(r.type)}\` **${cleanId(r.logicalId)}**\n`;
        for (const p of r.properties) if (p.newValue) md += `  - \`${p.name}\`: \`${p.newValue}\`\n`;
      }
      md += '\n';
    }
    if (byAction.UPDATE.length) {
      md += '**✏️ Update**\n';
      for (const r of byAction.UPDATE) {
        md += `- \`${shortType(r.type)}\` **${cleanId(r.logicalId)}**${r.properties.some(p => p.impact === 'WILL_REPLACE') ? ' ⚠️' : ''}\n`;
        for (const p of r.properties) {
          const warn = p.impact === 'WILL_REPLACE' ? ' ⚠️' : '';
          md += `  - \`${p.name}\`${warn}\n`;
          md += `    | | |\n    |---|---|\n`;
          md += `    | **OLD** | \`${p.oldValue || '(none)'}\` |\n`;
          md += `    | **NEW** | \`${p.newValue || '(removed)'}\` |\n\n`;
        }
      }
      md += '\n';
    }
    if (byAction.REMOVE.length) {
      md += '**🗑️ Destroy**\n';
      for (const r of byAction.REMOVE) md += `- \`${shortType(r.type)}\` **${cleanId(r.logicalId)}**\n`;
      md += '\n';
    }
  }
  if (unchanged.length) md += `<details><summary>✅ ${unchanged.length} unchanged</summary>\n\n${unchanged.map(s => `- ${s.stackName}`).join('\n')}\n</details>\n`;
  
  return md;
}

function formatSlackBlocks(data, context) {
  const { repo, runUrl, prUrl, prNum, isDeployment, actor, jobStatus } = context;
  
  const changed = data.stacks?.filter(s => s.hasDiff) || [];
  const adds = data.stacks?.reduce((n, s) => n + s.resources.filter(r => r.action === 'ADD').length, 0) || 0;
  const updates = data.stacks?.reduce((n, s) => n + s.resources.filter(r => r.action === 'UPDATE').length, 0) || 0;
  const removes = data.stacks?.reduce((n, s) => n + s.resources.filter(r => r.action === 'REMOVE').length, 0) || 0;
  
  // Header based on context
  let headerText;
  if (isDeployment) {
    headerText = jobStatus === 'success' ? '✅ CDK Deploy Succeeded' : '❌ CDK Deploy Failed';
  } else {
    headerText = '🔍 CDK Diff';
  }
  
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: headerText, emoji: true } }
  ];
  
  // Context line
  if (prUrl && prNum) {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `<${prUrl}|PR #${prNum}> in \`${repo}\`` }] });
  } else {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `\`${repo}\`${actor ? ` by ${actor}` : ''}` }] });
  }
  
  // Summary fields
  blocks.push({ 
    type: 'section', 
    fields: [
      { type: 'mrkdwn', text: `🟢 *Add*\n${adds}` }, 
      { type: 'mrkdwn', text: `🟡 *Update*\n${updates}` },
      { type: 'mrkdwn', text: `🔴 *Remove*\n${removes}` }, 
      { type: 'mrkdwn', text: `📦 *Stacks*\n${changed.length}` }
    ]
  });
  
  // Action buttons
  const buttons = [{ type: 'button', text: { type: 'plain_text', text: 'Workflow' }, url: runUrl }];
  if (prUrl) buttons.unshift({ type: 'button', text: { type: 'plain_text', text: 'View PR' }, url: prUrl });
  blocks.push({ type: 'actions', elements: buttons });
  
  // Stack details (limit to 5)
  for (const stack of changed.slice(0, 5)) {
    blocks.push({ type: 'divider' });
    let txt = `📦 *${stack.stackName}* _(${getEnv(stack.stackName)})_`;
    const byAction = { ADD: [], UPDATE: [], REMOVE: [] };
    for (const res of stack.resources) byAction[res.action].push(res);
    
    if (byAction.ADD.length) {
      txt += '\n🟢 *Create*';
      for (const r of byAction.ADD) {
        txt += `\n• \`${shortType(r.type)}\` *${cleanId(r.logicalId)}*`;
        for (const p of r.properties.slice(0, 3)) {
          if (p.newValue) txt += `\n   \`${p.name}\`:\n\`\`\`${p.newValue}\`\`\``;
        }
        if (r.properties.length > 3) txt += `\n   _+${r.properties.length - 3} more..._`;
      }
    }
    if (byAction.UPDATE.length) {
      txt += '\n🟡 *Update*';
      for (const r of byAction.UPDATE) {
        txt += `\n• \`${shortType(r.type)}\` *${cleanId(r.logicalId)}*`;
        for (const p of r.properties.slice(0, 2)) {
          txt += `\n   \`${p.name}\`${p.impact === 'WILL_REPLACE' ? ' ⚠️' : ''}`;
          txt += `\n   *OLD:*\n\`\`\`${p.oldValue || '(none)'}\`\`\``;
          txt += `\n   *NEW:*\n\`\`\`${p.newValue || '(removed)'}\`\`\``;
        }
        if (r.properties.length > 2) txt += `\n   _+${r.properties.length - 2} more properties..._`;
      }
    }
    if (byAction.REMOVE.length) {
      txt += '\n🔴 *Destroy*';
      for (const r of byAction.REMOVE) txt += `\n• \`${shortType(r.type)}\` *${cleanId(r.logicalId)}*`;
    }
    
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: txt } });
  }
  if (changed.length > 5) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `_+${changed.length - 5} more stacks..._` }] });
  
  return blocks;
}

// Main execution
const args = process.argv.slice(2);
const diffJson = args[0];
const contextJson = args[1];

try {
  const data = JSON.parse(diffJson);
  const context = JSON.parse(contextJson);
  
  const output = {
    markdown: formatMarkdown(data),
    slack_blocks: formatSlackBlocks(data, context)
  };
  
  console.log(JSON.stringify(output));
} catch (e) {
  console.log(JSON.stringify({ 
    markdown: `## 🔍 CDK Diff\n\n❌ Format error: ${e.message}`,
    slack_blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `❌ Format error: ${e.message}` }}]
  }));
}
