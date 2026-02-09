#!/usr/bin/env node
/**
 * Generates a comprehensive resource-map.json for CDK cost estimation.
 * 
 * Usage: node generate-resource-map.mjs [--validate]
 *   --validate: Check each mapping against the live AWS Pricing API
 * 
 * Requires: @aws-sdk/client-pricing (npm install @aws-sdk/client-pricing)
 */
import { PricingClient, GetProductsCommand } from '@aws-sdk/client-pricing';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'pricing', 'resource-map.json');
const validate = process.argv.includes('--validate');

const pricing = new PricingClient({ region: 'us-east-1' });
const LOCATION = 'US East (N. Virginia)';

// ── Free resources (no direct cost) ──────────────────────────────────────────
const FREE = [
  'AWS::IAM::Role', 'AWS::IAM::Policy', 'AWS::IAM::ManagedPolicy',
  'AWS::IAM::InstanceProfile', 'AWS::IAM::User', 'AWS::IAM::Group',
  'AWS::IAM::AccessKey', 'AWS::IAM::ServiceLinkedRole',
  'AWS::IAM::OIDCProvider', 'AWS::IAM::SAMLProvider',
  'AWS::S3::BucketPolicy', 'AWS::SQS::QueuePolicy',
  'AWS::SNS::TopicPolicy', 'AWS::SNS::Subscription',
  'AWS::Lambda::Permission', 'AWS::Lambda::EventSourceMapping',
  'AWS::Lambda::Alias', 'AWS::Lambda::Version', 'AWS::Lambda::LayerVersion',
  'AWS::Lambda::EventInvokeConfig',
  'AWS::EC2::SecurityGroup', 'AWS::EC2::SubnetRouteTableAssociation',
  'AWS::EC2::Route', 'AWS::EC2::RouteTable',
  'AWS::EC2::Subnet', 'AWS::EC2::InternetGateway',
  'AWS::EC2::VPCGatewayAttachment', 'AWS::EC2::NetworkAclEntry',
  'AWS::EC2::NetworkAcl', 'AWS::EC2::SubnetNetworkAclAssociation',
  'AWS::EC2::PlacementGroup', 'AWS::EC2::KeyPair',
  'AWS::EC2::LaunchTemplate',
  'AWS::CloudFormation::Stack', 'AWS::CloudFormation::WaitCondition',
  'AWS::CloudFormation::WaitConditionHandle', 'AWS::CloudFormation::CustomResource',
  'AWS::CloudFormation::Macro',
  'AWS::CloudWatch::Alarm',
  'AWS::Logs::LogGroup', 'AWS::Logs::MetricFilter',
  'AWS::Logs::SubscriptionFilter',
  'AWS::Events::Rule', 'AWS::Events::EventBus',
  'AWS::ApplicationAutoScaling::ScalableTarget',
  'AWS::ApplicationAutoScaling::ScalingPolicy',
  'AWS::AutoScaling::LaunchConfiguration',
  'AWS::AutoScaling::ScalingPolicy', 'AWS::AutoScaling::ScheduledAction',
  'AWS::AutoScaling::LifecycleHook',
  'AWS::SSM::Parameter', 'AWS::SSM::Association', 'AWS::SSM::Document',
  'AWS::ServiceDiscovery::PrivateDnsNamespace',
  'AWS::ServiceDiscovery::Service',
  'AWS::ECS::TaskDefinition', 'AWS::ECS::Cluster',
  'AWS::EKS::Addon',
  'AWS::CodeDeploy::Application', 'AWS::CodeDeploy::DeploymentGroup',
  'AWS::CodePipeline::Pipeline',
  'AWS::CertificateManager::Certificate',
  'AWS::Config::ConfigRule', 'AWS::Config::ConfigurationRecorder',
  'AWS::Config::DeliveryChannel',
  'AWS::CDK::Metadata',
  'Custom::S3AutoDeleteObjects', 'Custom::VpcRestrictDefaultSG',
  'Custom::AWS', 'Custom::CrossRegionExportWriter',
];

// ── Priced resources: [cfnType, serviceCode, unit, multiplierKey, multiplierVal, filters, note?] ──
const PRICED = [
  // ─── Compute ───
  ['AWS::EC2::Instance', 'AmazonEC2', 'Hrs', 'monthlyHours', 730, [
    ['instanceType', {cfProperty:'InstanceType'}], ['operatingSystem', {default:'Linux'}],
    ['tenancy', {default:'Shared'}], ['capacitystatus', {default:'Used'}],
    ['preInstalledSw', {default:'NA'}], ['productFamily', {default:'Compute Instance'}]
  ]],
  ['AWS::EC2::NatGateway', 'AmazonEC2', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'NAT Gateway'}], ['group', {default:'NGW:NatGateway'}]
  ]],
  ['AWS::EC2::Volume', 'AmazonEC2', 'GB-Mo', null, null, [
    ['productFamily', {default:'Storage'}], ['volumeApiName', {cfProperty:'VolumeType', default:'gp3'}]
  ], 'EBS volume'],
  ['AWS::EC2::VPNConnection', 'AmazonVPC', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'VPNConnection'}]
  ]],
  ['AWS::EC2::TransitGateway', 'AmazonVPC', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'TransitGateway'}]
  ]],
  ['AWS::EC2::TransitGatewayAttachment', 'AmazonVPC', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'TransitGateway'}],
    ['usagetype', {default:'USE1-TransitGateway-Hours'}]
  ]],
  ['AWS::EC2::ClientVpnEndpoint', 'AmazonVPC', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'VPNConnection'}],
    ['usagetype', {default:'USE1-ClientVPN-ConnectionHours'}]
  ]],
  ['AWS::EC2::EIP', 'AmazonEC2', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'IP Address'}],
    ['usagetype', {default:'USE1-PublicIPv4:InUseAddress'}]
  ], 'Public IPv4 address cost (since Feb 2024)'],
  ['AWS::EC2::VPCEndpoint', 'AmazonVPC', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'VpcEndpoint'}],
    ['usagetype', {default:'USE1-VpcEndpoint-Hours'}]
  ], 'Interface endpoint hourly cost. Gateway endpoints are free.'],
  ['AWS::EC2::Host', 'AmazonEC2', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'Dedicated Host'}]
  ]],
  // ─── Load Balancers ───
  ['AWS::ElasticLoadBalancingV2::LoadBalancer', 'AmazonEC2', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'Load Balancer-Application'}],
    ['usagetype', {default:'USE1-LoadBalancerUsage'}]
  ]],
  ['AWS::ElasticLoadBalancing::LoadBalancer', 'AmazonEC2', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'Load Balancer'}],
    ['usagetype', {default:'USE1-LoadBalancerUsage'}]
  ]],
  // ─── Auto Scaling ───
  ['AWS::AutoScaling::AutoScalingGroup', 'AmazonEC2', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'Compute Instance'}],
    ['instanceType', {cfProperty:'LaunchConfigurationName', default:'t3.medium'}],
    ['operatingSystem', {default:'Linux'}], ['tenancy', {default:'Shared'}],
    ['capacitystatus', {default:'Used'}], ['preInstalledSw', {default:'NA'}]
  ], 'Estimate based on instance type from launch config'],
  // ─── Serverless ───
  ['AWS::Lambda::Function', 'AWSLambda', 'Lambda-GB-Second', 'monthlyQuantity', 400000, [
    ['productFamily', {default:'Serverless'}], ['group', {default:'AWS-Lambda-Duration'}],
    ['usagetype', {default:'USE1-Lambda-GB-Second'}]
  ], 'Estimate based on 400k GB-seconds/month (free tier boundary)'],
  ['AWS::StepFunctions::StateMachine', 'AmazonStates', 'StateTransition', 'monthlyQuantity', 10000, [
    ['productFamily', {default:'AWS Step Functions'}],
    ['usagetype', {default:'USE1-StateTransition'}]
  ], 'Estimate based on 10k transitions/month'],
  // ─── Containers ───
  ['AWS::ECS::Service', 'AmazonECS', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'Compute'}],
    ['usagetype', {default:'USE1-Fargate-vCPU-Hours:perCPU'}]
  ], 'Fargate vCPU pricing. Estimate based on 1 task running 24/7.'],
  ['AWS::EKS::Cluster', 'AmazonEKS', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'Compute'}],
    ['usagetype', {default:'USE1-AmazonEKS-Hours:perCluster'}]
  ]],
  ['AWS::EKS::Nodegroup', 'AmazonEKS', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'Compute'}],
    ['usagetype', {default:'USE1-AmazonEKS-Hours:perCluster'}]
  ], 'EKS control plane cost only. Node costs depend on EC2 instance type.'],
  ['AWS::EKS::FargateProfile', 'AmazonEKS', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'Compute'}],
    ['usagetype', {default:'USE1-Fargate-vCPU-Hours:perCPU'}]
  ]],
  ['AWS::ECR::Repository', 'AmazonECR', 'GB-Mo', 'monthlyQuantity', 10, [
    ['productFamily', {default:'EC2 Container Registry'}]
  ], 'Estimate based on 10 GB stored images'],
  // ─── Databases ───
  ['AWS::RDS::DBInstance', 'AmazonRDS', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'Database Instance'}],
    ['instanceType', {cfProperty:'DBInstanceClass'}],
    ['databaseEngine', {cfProperty:'Engine'}]
  ]],
  ['AWS::RDS::DBCluster', 'AmazonRDS', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'Database Instance'}],
    ['databaseEngine', {cfProperty:'Engine'}]
  ], 'Aurora cluster. Cost is per-instance; multiply by instance count.'],
  ['AWS::RDS::DBProxy', 'AmazonRDS', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'RDS Proxy'}]
  ]],
  ['AWS::DynamoDB::Table', 'AmazonDynamoDB', 'WriteCapacityUnit-Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'Database'}], ['group', {default:'DDB-WriteUnits'}]
  ], 'Provisioned WCU cost. On-demand and RCU costs not included.'],
  ['AWS::DynamoDB::GlobalTable', 'AmazonDynamoDB', 'WriteCapacityUnit-Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'Database'}], ['group', {default:'DDB-WriteUnits'}]
  ], 'Global table provisioned WCU cost per replica region.'],
  ['AWS::ElastiCache::CacheCluster', 'AmazonElastiCache', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'Cache Instance'}],
    ['instanceType', {cfProperty:'CacheNodeType'}]
  ]],
  ['AWS::ElastiCache::ReplicationGroup', 'AmazonElastiCache', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'Cache Instance'}],
    ['instanceType', {cfProperty:'CacheNodeType'}]
  ]],
  ['AWS::ElastiCache::ServerlessCache', 'AmazonElastiCache', 'ElastiCacheProcessingUnits', 'monthlyHours', 730, [
    ['productFamily', {default:'ElastiCache Serverless'}]
  ], 'Serverless ElastiCache ECPU-based pricing'],
  ['AWS::DocDB::DBInstance', 'AmazonDocDB', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'Database Instance'}],
    ['instanceType', {cfProperty:'DBInstanceClass'}]
  ]],
  ['AWS::DocDB::DBCluster', 'AmazonDocDB', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'Database Instance'}]
  ]],
  ['AWS::Neptune::DBInstance', 'AmazonNeptune', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'Database Instance'}],
    ['instanceType', {cfProperty:'DBInstanceClass'}]
  ]],
  ['AWS::Neptune::DBCluster', 'AmazonNeptune', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'Database Instance'}]
  ]],
  ['AWS::Redshift::Cluster', 'AmazonRedshift', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'Compute Instance'}],
    ['instanceType', {cfProperty:'NodeType'}]
  ]],
  ['AWS::MemoryDB::Cluster', 'AmazonMemoryDB', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'MemoryDB'}]
  ]],
  ['AWS::Timestream::Table', 'AmazonTimestream', 'GB-Mo', 'monthlyQuantity', 10, [
    ['productFamily', {default:'Storage'}]
  ], 'Estimate based on 10 GB stored data'],
  // ─── Storage ───
  ['AWS::S3::Bucket', 'AmazonS3', 'GB-Mo', 'monthlyQuantity', 100, [
    ['productFamily', {default:'Storage'}], ['volumeType', {default:'Standard'}]
  ], 'Estimate based on 100 GB standard storage'],
  ['AWS::EFS::FileSystem', 'AmazonEFS', 'GB-Mo', 'monthlyQuantity', 100, [
    ['productFamily', {default:'Storage'}],
    ['usagetype', {default:'USE1-TimedStorage-ByteHrs'}]
  ], 'Estimate based on 100 GB standard storage'],
  ['AWS::FSx::FileSystem', 'AmazonFSx', 'GB-Mo', 'monthlyQuantity', 1024, [
    ['productFamily', {default:'Storage'}]
  ], 'Estimate based on 1 TB storage'],
  ['AWS::Backup::BackupVault', 'AWSBackup', 'GB-Mo', 'monthlyQuantity', 100, [
    ['productFamily', {default:'AWS Backup Storage'}]
  ], 'Estimate based on 100 GB backup storage'],
  // ─── CDN / Edge ───
  ['AWS::CloudFront::Distribution', 'AmazonCloudFront', 'Requests', 'monthlyQuantity', 10000000, [
    ['productFamily', {default:'Request'}]
  ], 'Estimate based on 10M HTTP requests/month'],
  ['AWS::GlobalAccelerator::Accelerator', 'AWSGlobalAccelerator', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'Global Accelerator'}]
  ]],
  // ─── Messaging ───
  ['AWS::SQS::Queue', 'AWSQueueService', 'Requests', 'monthlyQuantity', 1000000, [
    ['productFamily', {default:'Queue'}], ['queueType', {default:'Standard'}]
  ], 'Estimate based on 1M requests/month'],
  ['AWS::SNS::Topic', 'AmazonSNS', 'Requests', 'monthlyQuantity', 1000000, [
    ['productFamily', {default:'Message Delivery'}]
  ], 'Estimate based on 1M publishes/month'],
  ['AWS::Kinesis::Stream', 'AmazonKinesis', 'Shard-Hours', 'monthlyHours', 730, [
    ['productFamily', {default:'Kinesis Streams'}]
  ]],
  ['AWS::KinesisFirehose::DeliveryStream', 'AmazonKinesisFirehose', 'GB', 'monthlyQuantity', 100, [
    ['productFamily', {default:'Kinesis Firehose'}]
  ], 'Estimate based on 100 GB ingested/month'],
  ['AWS::KinesisAnalyticsV2::Application', 'AmazonKinesisAnalytics', 'KPU-Hour', 'monthlyHours', 730, [
    ['productFamily', {default:'Kinesis Analytics'}]
  ], 'Estimate based on 1 KPU running 24/7'],
  // ─── Security ───
  ['AWS::KMS::Key', 'awskms', 'months', null, null, [
    ['productFamily', {default:'Encryption Key'}]
  ], '$1/month per CMK'],
  ['AWS::KMS::Alias', '_free', null, null, null, []], // alias is free
  ['AWS::SecretsManager::Secret', 'AWSSecretsManager', 'months', null, null, [
    ['productFamily', {default:'Secret'}]
  ], '$0.40/month per secret'],
  ['AWS::WAFv2::WebACL', 'awswaf', 'months', null, null, [
    ['productFamily', {default:'Web Application Firewall'}]
  ], '$5/month per Web ACL'],
  ['AWS::WAFv2::IPSet', '_free', null, null, null, []],
  ['AWS::WAFv2::RuleGroup', 'awswaf', 'months', null, null, [
    ['productFamily', {default:'Web Application Firewall'}]
  ]],
  ['AWS::NetworkFirewall::Firewall', 'AmazonVPC', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'Network Firewall'}]
  ]],
  ['AWS::GuardDuty::Detector', 'AmazonGuardDuty', 'Events', 'monthlyQuantity', 1000000, [
    ['productFamily', {default:'Security & Monitoring'}]
  ], 'Estimate based on 1M events/month'],
  // ─── Search / Analytics ───
  ['AWS::Elasticsearch::Domain', 'AmazonES', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'Compute Instance'}],
    ['instanceType', {cfProperty:'ElasticsearchClusterConfig.InstanceType'}]
  ]],
  ['AWS::OpenSearchService::Domain', 'AmazonES', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'Compute Instance'}],
    ['instanceType', {cfProperty:'ClusterConfig.InstanceType'}]
  ]],
  ['AWS::Athena::WorkGroup', 'AmazonAthena', 'Terabytes', 'monthlyQuantity', 1, [
    ['productFamily', {default:'Athena'}]
  ], 'Estimate based on 1 TB scanned/month'],
  // ─── Streaming / Big Data ───
  ['AWS::MSK::Cluster', 'AmazonMSK', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'Managed Streaming for Apache Kafka (MSK)'}],
    ['instanceType', {cfProperty:'BrokerNodeGroupInfo.InstanceType'}]
  ]],
  ['AWS::MSK::ServerlessCluster', 'AmazonMSK', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'Managed Streaming for Apache Kafka (MSK)'}]
  ]],
  ['AWS::MWAA::Environment', 'AmazonMWAA', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'Managed Workflows for Apache Airflow'}],
    ['usagetype', {cfProperty:'EnvironmentClass', default:'USE1-EnvironmentHours:mw1.small'}]
  ]],
  ['AWS::Glue::Job', 'AWSGlue', 'DPU-Hour', 'monthlyHours', 20, [
    ['productFamily', {default:'AWS Glue'}],
    ['usagetype', {default:'USE1-Glue-DPU-Hour'}]
  ], 'Estimate based on 20 DPU-hours/month'],
  ['AWS::Glue::Crawler', 'AWSGlue', 'DPU-Hour', 'monthlyHours', 10, [
    ['productFamily', {default:'AWS Glue'}],
    ['usagetype', {default:'USE1-Glue-DPU-Hour'}]
  ], 'Estimate based on 10 DPU-hours/month'],
  ['AWS::Glue::Database', '_free', null, null, null, []],
  // ─── DNS / Networking ───
  ['AWS::Route53::HostedZone', 'AmazonRoute53', 'months', null, null, [
    ['productFamily', {default:'DNS Zone'}],
    ['usagetype', {default:'HostedZone'}]
  ], '$0.50/month per hosted zone'],
  ['AWS::Route53::HealthCheck', 'AmazonRoute53', 'months', null, null, [
    ['productFamily', {default:'DNS Health Check'}]
  ]],
  ['AWS::Route53Resolver::ResolverEndpoint', 'AmazonRoute53', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'DNS Query'}],
    ['usagetype', {default:'USE1-ResolverNetworkInterface'}]
  ]],
  ['AWS::EC2::VPC', '_free', null, null, null, []],
  // ─── API Gateway ───
  ['AWS::ApiGateway::RestApi', 'AmazonApiGateway', 'Requests', 'monthlyQuantity', 1000000, [
    ['productFamily', {default:'API Calls'}]
  ], 'Estimate based on 1M API calls/month'],
  ['AWS::ApiGatewayV2::Api', 'AmazonApiGateway', 'Requests', 'monthlyQuantity', 1000000, [
    ['productFamily', {default:'WebSocket'}]
  ], 'Estimate based on 1M messages/month'],
  // ─── Data Transfer / DX ───
  ['AWS::DirectConnect::Connection', 'AWSDirectConnect', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'Direct Connect'}]
  ]],
  // ─── Monitoring ───
  ['AWS::CloudWatch::Dashboard', 'AmazonCloudWatch', 'months', null, null, [
    ['productFamily', {default:'Dashboard'}]
  ], '$3/month per dashboard'],
  // ─── Misc ───
  ['AWS::CodeBuild::Project', 'CodeBuild', 'Minutes', 'monthlyQuantity', 500, [
    ['productFamily', {default:'Compute'}]
  ], 'Estimate based on 500 build-minutes/month'],
  ['AWS::Transfer::Server', 'AWSTransferFamily', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'AWS Transfer Family'}]
  ]],
  ['AWS::CloudHSM::Cluster', 'CloudHSM', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'CloudHSM'}]
  ]],
  ['AWS::CloudTrail::Trail', 'AWSCloudTrail', 'Events', 'monthlyQuantity', 100000, [
    ['productFamily', {default:'Management Tools - AWS CloudTrail'}]
  ], 'First trail in each region is free. Estimate for additional trails.'],
  ['AWS::DMS::ReplicationInstance', 'AWSDatabaseMigrationSvc', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'Database Migration'}],
    ['instanceType', {cfProperty:'ReplicationInstanceClass'}]
  ]],
  ['AWS::Lightsail::Instance', 'AmazonLightsail', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'Lightsail Instance'}]
  ]],
  ['AWS::MQ::Broker', 'AmazonMQ', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'Broker Instances'}],
    ['instanceType', {cfProperty:'HostInstanceType'}]
  ]],
  ['AWS::Grafana::Workspace', 'AmazonGrafana', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'Amazon Managed Grafana'}]
  ]],
  ['AWS::DirectoryService::MicrosoftAD', 'AWSDirectoryService', 'Hrs', 'monthlyHours', 730, [
    ['productFamily', {default:'AWS Directory Service'}]
  ]],
];

// ── Build the JSON ───────────────────────────────────────────────────────────
function buildMap() {
  const map = {
    _comment: 'Auto-generated by generate-resource-map.mjs. Maps CloudFormation resource types to AWS Pricing API query params.',
    _free: FREE,
  };

  for (const [cfn, svc, unit, mulKey, mulVal, rawFilters, note] of PRICED) {
    if (svc === '_free') {
      if (!map._free.includes(cfn)) map._free.push(cfn);
      continue;
    }
    const entry = { serviceCode: svc, unit };
    if (mulKey && mulVal) entry[mulKey] = mulVal;
    if (note) entry.note = note;
    entry.filters = rawFilters.map(([field, val]) => ({ Field: field, Value: val }));
    map[cfn] = entry;
  }
  return map;
}

// ── Validate against live Pricing API ────────────────────────────────────────
async function validateMap(map) {
  let ok = 0, fail = 0, skip = 0;
  for (const [cfn, entry] of Object.entries(map)) {
    if (cfn.startsWith('_')) continue;
    const filters = entry.filters
      .filter(f => f.Value.default) // only validate defaults
      .map(f => ({ Type: 'TERM_MATCH', Field: f.Field, Value: f.Value.default }));
    filters.push({ Type: 'TERM_MATCH', Field: 'location', Value: LOCATION });

    try {
      const resp = await pricing.send(new GetProductsCommand({
        ServiceCode: entry.serviceCode, Filters: filters, MaxResults: 1,
      }));
      if (resp.PriceList?.length > 0) {
        console.log(`  ✓ ${cfn}`);
        ok++;
      } else {
        console.log(`  ✗ ${cfn} — no results (serviceCode=${entry.serviceCode})`);
        fail++;
      }
    } catch (e) {
      console.log(`  ✗ ${cfn} — ${e.message}`);
      fail++;
    }
  }
  console.log(`\nValidation: ${ok} ok, ${fail} failed, ${skip} skipped`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
const map = buildMap();
const json = JSON.stringify(map, null, 2);
writeFileSync(OUT, json + '\n');
console.log(`Wrote ${OUT}`);
console.log(`  Priced resources: ${Object.keys(map).filter(k => !k.startsWith('_')).length}`);
console.log(`  Free resources:   ${map._free.length}`);

if (validate) {
  console.log('\nValidating against AWS Pricing API...');
  await validateMap(map);
}
