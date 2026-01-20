/**
 * CDK Diff & Drift Script using @aws-cdk/toolkit-lib
 * 
 * This script provides programmatic access to CDK diff and drift detection
 * with structured JSON output for easy consumption in CI/CD pipelines.
 * 
 * Usage:
 *   npx ts-node cdk-diff.ts --config config.json
 * 
 * Config format:
 *   {
 *     "assemblyDir": "cdk.out",
 *     "profile": "default",           // Optional: AWS profile
 *     "stacks": ["Stack1", "Stack2"], // Optional: filter stacks
 *     "enableDrift": true             // Optional: run drift detection
 *   }
 * 
 * Output: JSON with diff and drift results for each stack
 */

import { Toolkit, StackSelectionStrategy, BaseCredentials } from '@aws-cdk/toolkit-lib';
import * as fs from 'fs';

// ============================================================================
// Types
// ============================================================================

interface Config {
  assemblyDir: string;
  profile?: string;
  stacks?: string[];
  enableDrift?: boolean;
  region?: string;
}

interface PropertyDiff {
  name: string;
  changeImpact: string;
  isDifferent: boolean;
  oldValue?: any;
  newValue?: any;
}

interface ResourceDiff {
  logicalId: string;
  resourceType: string;
  action: 'ADD' | 'UPDATE' | 'REMOVE';
  properties: PropertyDiff[];
  willReplace?: boolean;
}

interface IamChange {
  type: 'ADD' | 'REMOVE';
  effect: string;
  actions: string[];
  resources: string[];
  principal?: string;
}

interface SecurityGroupChange {
  type: 'ADD' | 'REMOVE';
  direction: 'INGRESS' | 'EGRESS';
  protocol: string;
  fromPort?: number;
  toPort?: number;
  source?: string;
}

interface StackDiffResult {
  stackName: string;
  hasDifferences: boolean;
  summary: {
    additions: number;
    updates: number;
    removals: number;
    replacements: number;
  };
  resources: ResourceDiff[];
  iamChanges: IamChange[];
  securityGroupChanges: SecurityGroupChange[];
  rawDiff?: string;
}

interface StackDriftResult {
  stackName: string;
  hasDrift: boolean;
  summary: {
    drifted: number;
    inSync: number;
    unchecked: number;
  };
  resources: Array<{
    logicalId: string;
    resourceType: string;
    driftStatus: string;
    propertyDifferences?: Array<{
      propertyPath: string;
      expectedValue: string;
      actualValue: string;
    }>;
  }>;
}

interface DiffOutput {
  success: boolean;
  timestamp: string;
  stacks: StackDiffResult[];
  drift?: StackDriftResult[];
  error?: string;
}

// ============================================================================
// Main Logic
// ============================================================================

async function runDiff(config: Config): Promise<DiffOutput> {
  const output: DiffOutput = {
    success: false,
    timestamp: new Date().toISOString(),
    stacks: [],
  };

  try {
    // Initialize toolkit with optional profile
    const toolkitOptions: any = {
      ioHost: {
        notify: async () => {},
        requestResponse: async (msg: any) => msg.defaultResponse,
      },
    };

    if (config.profile) {
      toolkitOptions.sdkConfig = {
        baseCredentials: BaseCredentials.awsCliCompatible({ profile: config.profile }),
      };
    }

    const toolkit = new Toolkit(toolkitOptions);

    // Load cloud assembly
    const cx = await toolkit.fromAssemblyDirectory(config.assemblyDir);

    // Configure stack selection
    const stackSelector = config.stacks?.length
      ? {
          strategy: StackSelectionStrategy.PATTERN_MUST_MATCH as const,
          patterns: config.stacks,
        }
      : { strategy: StackSelectionStrategy.ALL_STACKS as const };

    // Run diff
    const diffResults = await toolkit.diff(cx, { stacks: stackSelector });

    // Process diff results
    for (const [stackName, diff] of Object.entries(diffResults as Record<string, any>)) {
      const stackResult: StackDiffResult = {
        stackName,
        hasDifferences: false,
        summary: { additions: 0, updates: 0, removals: 0, replacements: 0 },
        resources: [],
        iamChanges: [],
        securityGroupChanges: [],
      };

      // Process resource diffs
      const resourceDiffs = diff.resources?.diffs || {};
      for (const [logicalId, resDiff] of Object.entries(resourceDiffs as Record<string, any>)) {
        const resourceType = resDiff.resourceTypes?.newType || resDiff.resourceTypes?.oldType || 'Unknown';
        
        let action: 'ADD' | 'UPDATE' | 'REMOVE';
        if (resDiff.isAddition) {
          action = 'ADD';
          stackResult.summary.additions++;
        } else if (resDiff.isRemoval) {
          action = 'REMOVE';
          stackResult.summary.removals++;
        } else {
          action = 'UPDATE';
          stackResult.summary.updates++;
        }

        // Check for replacements
        const willReplace = Object.values(resDiff.propertyDiffs || {}).some(
          (p: any) => p.changeImpact === 'WILL_REPLACE'
        );
        if (willReplace) {
          stackResult.summary.replacements++;
        }

        // Extract property changes
        const properties: PropertyDiff[] = [];
        for (const [propName, propDiff] of Object.entries(resDiff.propertyDiffs || {} as Record<string, any>)) {
          if (propDiff.isDifferent) {
            properties.push({
              name: propName,
              changeImpact: propDiff.changeImpact || 'UNKNOWN',
              isDifferent: true,
              oldValue: simplifyValue(propDiff.oldValue),
              newValue: simplifyValue(propDiff.newValue),
            });
          }
        }

        stackResult.resources.push({
          logicalId,
          resourceType,
          action,
          properties,
          willReplace,
        });
      }

      // Process IAM changes
      const iamStatements = diff.iamChanges?.statements || {};
      for (const stmt of iamStatements.additions || []) {
        stackResult.iamChanges.push({
          type: 'ADD',
          effect: stmt.effect || 'Allow',
          actions: stmt.actions || [],
          resources: stmt.resources || [],
          principal: stmt.principals?.[0]?.value,
        });
      }
      for (const stmt of iamStatements.removals || []) {
        stackResult.iamChanges.push({
          type: 'REMOVE',
          effect: stmt.effect || 'Allow',
          actions: stmt.actions || [],
          resources: stmt.resources || [],
          principal: stmt.principals?.[0]?.value,
        });
      }

      // Process Security Group changes
      const sgIngress = diff.securityGroupChanges?.ingress || {};
      const sgEgress = diff.securityGroupChanges?.egress || {};
      
      for (const rule of sgIngress.additions || []) {
        stackResult.securityGroupChanges.push({
          type: 'ADD',
          direction: 'INGRESS',
          protocol: rule.protocol || 'tcp',
          fromPort: rule.fromPort,
          toPort: rule.toPort,
          source: rule.peer?.value,
        });
      }
      for (const rule of sgIngress.removals || []) {
        stackResult.securityGroupChanges.push({
          type: 'REMOVE',
          direction: 'INGRESS',
          protocol: rule.protocol || 'tcp',
          fromPort: rule.fromPort,
          toPort: rule.toPort,
          source: rule.peer?.value,
        });
      }
      for (const rule of sgEgress.additions || []) {
        stackResult.securityGroupChanges.push({
          type: 'ADD',
          direction: 'EGRESS',
          protocol: rule.protocol || 'tcp',
          fromPort: rule.fromPort,
          toPort: rule.toPort,
          source: rule.peer?.value,
        });
      }
      for (const rule of sgEgress.removals || []) {
        stackResult.securityGroupChanges.push({
          type: 'REMOVE',
          direction: 'EGRESS',
          protocol: rule.protocol || 'tcp',
          fromPort: rule.fromPort,
          toPort: rule.toPort,
          source: rule.peer?.value,
        });
      }

      stackResult.hasDifferences = 
        stackResult.summary.additions > 0 ||
        stackResult.summary.updates > 0 ||
        stackResult.summary.removals > 0;

      output.stacks.push(stackResult);
    }

    // Run drift detection if enabled
    if (config.enableDrift) {
      output.drift = [];
      
      try {
        const driftResults = await toolkit.drift(cx, { stacks: stackSelector });
        
        for (const [stackName, driftInfo] of Object.entries(driftResults as Record<string, any>)) {
          const driftResult: StackDriftResult = {
            stackName,
            hasDrift: (driftInfo.numResourcesWithDrift || 0) > 0,
            summary: {
              drifted: driftInfo.numResourcesWithDrift || 0,
              inSync: 0,
              unchecked: driftInfo.numResourcesUnchecked || 0,
            },
            resources: [],
          };

          // Process formatted drift if available
          const formattedDrift = driftInfo.formattedDrift || {};
          for (const [logicalId, resDrift] of Object.entries(formattedDrift as Record<string, any>)) {
            driftResult.resources.push({
              logicalId,
              resourceType: resDrift.resourceType || 'Unknown',
              driftStatus: resDrift.driftStatus || 'UNKNOWN',
              propertyDifferences: resDrift.propertyDifferences,
            });
          }

          output.drift.push(driftResult);
        }
      } catch (driftError: any) {
        // Drift detection failed but diff succeeded - include error but don't fail
        console.error('Drift detection failed:', driftError.message);
      }
    }

    output.success = true;
  } catch (error: any) {
    output.error = error.message;
    output.success = false;
  }

  return output;
}

// Helper to simplify complex values for display
function simplifyValue(value: any): any {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    // For arrays, try to extract meaningful info
    if (value.length === 0) return '[]';
    if (value.length <= 3) return value.map(simplifyValue);
    return `[${value.length} items]`;
  }
  // For objects, try to summarize
  const keys = Object.keys(value);
  if (keys.length === 0) return '{}';
  if (keys.length <= 3) {
    const simplified: any = {};
    for (const k of keys) {
      simplified[k] = simplifyValue(value[k]);
    }
    return simplified;
  }
  return `{${keys.length} properties}`;
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  let configPath = 'cdk-diff-config.json';

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && args[i + 1]) {
      configPath = args[i + 1];
      i++;
    }
  }

  // Load config
  let config: Config;
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } else {
    // Default config
    config = {
      assemblyDir: 'cdk.out',
      enableDrift: true,
    };
  }

  // Run diff
  const result = await runDiff(config);

  // Output JSON
  console.log(JSON.stringify(result, null, 2));

  // Exit with error code if failed
  process.exit(result.success ? 0 : 1);
}

main().catch((err) => {
  console.error(JSON.stringify({ success: false, error: err.message }));
  process.exit(1);
});
