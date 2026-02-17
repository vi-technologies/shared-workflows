/**
 * CDK Diff Runner (using @aws-cdk/toolkit-lib)
 *
 * Runs CDK diff programmatically and outputs structured JSON.
 * Used by cdk-diff.yaml (single + multi account) and cdk-deploy.yaml.
 *
 * Environment variables:
 *   CDK_OUT    - Path to cdk.out assembly directory (required)
 *   STACKS     - Space-separated stack names (optional, defaults to all)
 *   ENABLE_DRIFT - "true" to run drift detection (optional)
 *
 * Output: JSON to stdout with shape:
 *   { success: boolean, stacks: [...], error: string }
 */
import { Toolkit, StackSelectionStrategy } from '@aws-cdk/toolkit-lib';

const stacks = (process.env.STACKS || '').split(' ').filter(Boolean);
const enableDrift = process.env.ENABLE_DRIFT === 'true';

const fmtVal = (v) =>
  v === undefined || v === null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v);

async function main() {
  const output = { success: false, stacks: [], error: '' };

  try {
    const toolkit = new Toolkit({
      ioHost: {
        notify: async () => {},
        requestResponse: async (msg) => msg.defaultResponse,
      },
    });

    const cx = await toolkit.fromAssemblyDirectory(process.env.CDK_OUT);

    const selector = stacks.length
      ? { strategy: StackSelectionStrategy.PATTERN_MUST_MATCH, patterns: stacks }
      : { strategy: StackSelectionStrategy.ALL_STACKS };

    const diffResults = await toolkit.diff(cx, { stacks: selector });

    for (const [name, diff] of Object.entries(diffResults)) {
      const result = { stackName: name, hasDiff: false, resources: [] };

      for (const [logicalId, resDiff] of Object.entries(diff.resources?.diffs || {})) {
        const type = resDiff.resourceTypes?.newType || resDiff.resourceTypes?.oldType || 'Unknown';
        const action = resDiff.isAddition ? 'ADD' : resDiff.isRemoval ? 'REMOVE' : 'UPDATE';
        const properties = Object.entries(resDiff.propertyDiffs || {})
          .filter(([_, p]) => p.isDifferent)
          .map(([n, p]) => ({
            name: n,
            impact: p.changeImpact || 'UNKNOWN',
            oldValue: fmtVal(p.oldValue),
            newValue: fmtVal(p.newValue),
          }));
        result.resources.push({ logicalId, type, action, properties });
        result.hasDiff = true;
      }

      if (enableDrift) {
        try {
          const dr = await toolkit.drift(cx, {
            stacks: { strategy: StackSelectionStrategy.PATTERN_MUST_MATCH, patterns: [name] },
          });
          result.drift = {
            status: (dr[name]?.numResourcesWithDrift || 0) > 0 ? 'DRIFTED' : 'IN_SYNC',
            count: dr[name]?.numResourcesWithDrift || 0,
          };
        } catch {
          // Drift detection may fail for some stacks, continue
        }
      }

      output.stacks.push(result);
    }

    output.success = true;
  } catch (e) {
    output.error = e.message || String(e);
  }

  console.log(JSON.stringify(output));
}

main();
