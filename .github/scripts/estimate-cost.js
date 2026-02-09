/**
 * CDK Cost Estimator
 * Queries the AWS Pricing API to estimate monthly cost impact of CDK changes.
 *
 * Usage: node estimate-cost.js <diff-json> <resource-map-path> <aws-region>
 *
 * Outputs a markdown string to stdout.
 * Requires: @aws-sdk/client-pricing (npm install before running)
 */

const { PricingClient, GetProductsCommand } = require('@aws-sdk/client-pricing');
const fs = require('fs');

// =============================================================================
// Region code → AWS Pricing API "location" name
// The Pricing API works more reliably with human-readable location names.
// =============================================================================
const REGION_NAMES = {
  'us-east-1':      'US East (N. Virginia)',
  'us-east-2':      'US East (Ohio)',
  'us-west-1':      'US West (N. California)',
  'us-west-2':      'US West (Oregon)',
  'af-south-1':     'Africa (Cape Town)',
  'ap-east-1':      'Asia Pacific (Hong Kong)',
  'ap-south-1':     'Asia Pacific (Mumbai)',
  'ap-south-2':     'Asia Pacific (Hyderabad)',
  'ap-southeast-1': 'Asia Pacific (Singapore)',
  'ap-southeast-2': 'Asia Pacific (Sydney)',
  'ap-southeast-3': 'Asia Pacific (Jakarta)',
  'ap-northeast-1': 'Asia Pacific (Tokyo)',
  'ap-northeast-2': 'Asia Pacific (Seoul)',
  'ap-northeast-3': 'Asia Pacific (Osaka)',
  'ca-central-1':   'Canada (Central)',
  'eu-central-1':   'EU (Frankfurt)',
  'eu-central-2':   'EU (Zurich)',
  'eu-west-1':      'EU (Ireland)',
  'eu-west-2':      'EU (London)',
  'eu-west-3':      'EU (Paris)',
  'eu-south-1':     'EU (Milan)',
  'eu-south-2':     'EU (Spain)',
  'eu-north-1':     'EU (Stockholm)',
  'il-central-1':   'Israel (Tel Aviv)',
  'me-south-1':     'Middle East (Bahrain)',
  'me-central-1':   'Middle East (UAE)',
  'sa-east-1':      'South America (Sao Paulo)',
};

// =============================================================================
// Parse arguments
// =============================================================================
const args = process.argv.slice(2);
const diffJson = args[0];
const resourceMapPath = args[1];
const region = args[2] || 'us-east-1';

let diffData, resourceMap;
try {
  diffData = JSON.parse(diffJson);
  resourceMap = JSON.parse(fs.readFileSync(resourceMapPath, 'utf8'));
} catch (e) {
  console.error('Failed to parse inputs:', e.message);
  console.log(JSON.stringify({ markdown: '', error: e.message }));
  process.exit(0);
}

const locationName = REGION_NAMES[region] || REGION_NAMES['us-east-1'];

// Pricing API is only available in us-east-1 and ap-south-1
const pricing = new PricingClient({ region: 'us-east-1' });

// =============================================================================
// Pricing cache — avoids redundant API calls for identical filter sets
// =============================================================================
const priceCache = new Map();

function cacheKey(serviceCode, filters) {
  return JSON.stringify({
    serviceCode,
    filters: [...filters].sort((a, b) => a.Field.localeCompare(b.Field)),
  });
}

async function queryPrice(serviceCode, filters) {
  const key = cacheKey(serviceCode, filters);
  if (priceCache.has(key)) return priceCache.get(key);

  const allFilters = [
    ...filters.map((f) => ({ Type: 'TERM_MATCH', Field: f.Field, Value: f.Value })),
    { Type: 'TERM_MATCH', Field: 'location', Value: locationName },
  ];

  try {
    const resp = await pricing.send(
      new GetProductsCommand({
        ServiceCode: serviceCode,
        Filters: allFilters,
        MaxResults: 1,
      })
    );

    if (!resp.PriceList?.length) {
      priceCache.set(key, null);
      return null;
    }

    const product = JSON.parse(resp.PriceList[0]);
    const onDemand = product.terms?.OnDemand;
    if (!onDemand) {
      priceCache.set(key, null);
      return null;
    }

    // Iterate all dimensions to find a non-zero USD price
    for (const offerKey of Object.keys(onDemand)) {
      const dims = onDemand[offerKey]?.priceDimensions;
      if (!dims) continue;
      for (const dimKey of Object.keys(dims)) {
        const usd = parseFloat(dims[dimKey]?.pricePerUnit?.USD || '0');
        if (usd > 0) {
          const entry = { usd, unit: dims[dimKey]?.unit || '', description: dims[dimKey]?.description || '' };
          priceCache.set(key, entry);
          return entry;
        }
      }
    }

    priceCache.set(key, null);
    return null;
  } catch (e) {
    console.error(`[warn] Pricing API error for ${serviceCode}: ${e.message}`);
    priceCache.set(key, null);
    return null;
  }
}

// =============================================================================
// Filter resolution helpers
// =============================================================================
function resolveFilterValue(valueDef, properties, useNew) {
  if (valueDef.default && !valueDef.cfProperty) return valueDef.default;
  if (valueDef.cfProperty) {
    const prop = (properties || []).find((p) => p.name === valueDef.cfProperty);
    if (prop) {
      const val = useNew ? prop.newValue : prop.oldValue;
      if (val && val !== 'null' && val !== 'undefined') return val;
    }
    return valueDef.default || null;
  }
  return null;
}

function buildFilters(mapping, properties, useNew) {
  const resolved = [];
  for (const filter of mapping.filters) {
    const value = resolveFilterValue(filter.Value, properties, useNew);
    if (value) resolved.push({ Field: filter.Field, Value: value });
  }
  return resolved;
}

function monthlyCost(unitPrice, mapping) {
  if (mapping.monthlyHours) return unitPrice * mapping.monthlyHours;
  if (mapping.monthlyQuantity) return unitPrice * mapping.monthlyQuantity;
  return unitPrice;
}

// =============================================================================
// Formatting helpers
// =============================================================================
function fmt(n) {
  if (n == null) return '-';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDelta(n) {
  if (n == null) return 'no cost data';
  if (Math.abs(n) < 0.005) return '~$0.00';
  return (n > 0 ? '+' : '') + '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function shortType(t) { return t.split('::').pop(); }
function cleanId(id) { return id.replace(/[A-F0-9]{8}$/i, '').replace(/([a-z])([A-Z])/g, '$1 $2'); }

// =============================================================================
// Main
// =============================================================================
async function main() {
  const rows = [];
  let totalDelta = 0;
  let pricedCount = 0;
  let freeCount = 0;

  console.error(`Pricing region: ${region} (${locationName})`);
  console.error(`Resource types in map: ${Object.keys(resourceMap).filter((k) => !k.startsWith('_')).length} priced, ${(resourceMap._free || []).length} free`);

  for (const stack of diffData.stacks || []) {
    if (!stack.hasDiff) continue;

    for (const res of stack.resources || []) {
      if (res.type.startsWith('_') || res.type === 'Unknown') continue;

      // Skip free resources (IAM, policies, etc.)
      const freeList = resourceMap._free || [];
      if (freeList.includes(res.type)) {
        freeCount++;
        continue;
      }

      const mapping = resourceMap[res.type];
      if (!mapping) {
        rows.push({
          stack: stack.stackName, id: cleanId(res.logicalId),
          type: shortType(res.type), detail: '', action: res.action,
          before: null, after: null, delta: null,
        });
        continue;
      }

      console.error(`  Pricing ${res.action} ${res.type} (${res.logicalId})...`);
      let beforeCost = null;
      let afterCost = null;

      if (res.action === 'ADD') {
        const price = await queryPrice(mapping.serviceCode, buildFilters(mapping, res.properties, true));
        if (price) { afterCost = monthlyCost(price.usd, mapping); pricedCount++; }
      } else if (res.action === 'REMOVE') {
        const price = await queryPrice(mapping.serviceCode, buildFilters(mapping, res.properties, false));
        if (price) { beforeCost = monthlyCost(price.usd, mapping); pricedCount++; }
      } else if (res.action === 'UPDATE') {
        const oldPrice = await queryPrice(mapping.serviceCode, buildFilters(mapping, res.properties, false));
        const newPrice = await queryPrice(mapping.serviceCode, buildFilters(mapping, res.properties, true));
        if (oldPrice) beforeCost = monthlyCost(oldPrice.usd, mapping);
        if (newPrice) afterCost = monthlyCost(newPrice.usd, mapping);
        if (oldPrice || newPrice) pricedCount++;
      }

      const delta = (beforeCost != null || afterCost != null) ? (afterCost || 0) - (beforeCost || 0) : null;
      if (delta != null) totalDelta += delta;

      // Build detail string for UPDATEs (e.g., "t3.micro → t3.large")
      let detail = '';
      if (res.action === 'UPDATE') {
        for (const f of mapping.filters) {
          if (f.Value.cfProperty) {
            const prop = (res.properties || []).find((p) => p.name === f.Value.cfProperty);
            if (prop && prop.oldValue && prop.newValue && prop.oldValue !== prop.newValue) {
              detail = `${prop.oldValue} \u2192 ${prop.newValue}`;
              break;
            }
          }
        }
      }

      rows.push({
        stack: stack.stackName, id: cleanId(res.logicalId),
        type: shortType(res.type), detail, action: res.action,
        before: beforeCost, after: afterCost, delta,
      });
    }
  }

  // ===========================================================================
  // Build markdown
  // ===========================================================================
  let md = '\n\n## \uD83D\uDCB0 Cost Estimate\n\n';

  if (rows.length === 0) {
    md += 'No infrastructure changes with cost impact detected.\n';
  } else {
    const unmapped = rows.filter((r) => r.delta === null).length;

    md += `**Estimated monthly impact: ${fmtDelta(totalDelta)}/mo**\n\n`;
    md += '| Stack | Resource | Type | Change | Before | After | Delta |\n';
    md += '|-------|----------|------|--------|-------:|------:|------:|\n';

    for (const r of rows) {
      const typeStr = r.detail ? `${r.type} (${r.detail})` : r.type;
      const icon = r.action === 'ADD' ? '\uD83D\uDFE2' : r.action === 'REMOVE' ? '\uD83D\uDD34' : '\uD83D\uDFE1';
      md += `| ${r.stack} | ${r.id} | ${typeStr} | ${icon} ${r.action} | ${fmt(r.before)} | ${fmt(r.after)} | ${fmtDelta(r.delta)} |\n`;
    }

    if (unmapped > 0) {
      md += `\n> \u2139\uFE0F **${unmapped}** resource(s) have no pricing data. Add entries to \`.github/pricing/resource-map.json\` to extend coverage.\n`;
    }

    if (freeCount > 0) {
      md += `\n> \u2705 **${freeCount}** resource(s) are free (IAM, policies, etc.) and excluded from the estimate.\n`;
    }

    // Collect estimation notes from resource mappings
    const usedNotes = new Set();
    for (const r of rows) {
      if (r.delta === null) continue;
      const fullType = Object.keys(resourceMap).find((k) => shortType(k) === r.type);
      if (fullType && resourceMap[fullType].note) usedNotes.add(resourceMap[fullType].note);
    }
    if (usedNotes.size > 0) {
      md += '\n<details><summary>\uD83D\uDCDD Estimation notes</summary>\n\n';
      for (const note of usedNotes) md += `- ${note}\n`;
      md += '\n</details>\n';
    }
  }

  md += `\n<sub>Prices: AWS Pricing API (on-demand, ${locationName}). Estimates are approximate.</sub>\n`;

  // Output as JSON for easy consumption by the workflow
  console.log(JSON.stringify({ markdown: md }));
}

main().catch((e) => {
  console.error('Cost estimation error:', e);
  console.log(JSON.stringify({ markdown: '', error: e.message }));
});
