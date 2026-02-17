#!/usr/bin/env node
/**
 * Generates resource-map.json by fetching Infracost's Go source from GitHub,
 * parsing out AWS Pricing API service codes & product families, then mapping
 * Terraform resource names → CloudFormation resource types.
 *
 * Usage: node generate-resource-map.mjs [--validate]
 * Requires: @aws-sdk/client-pricing (only for --validate)
 */
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'pricing', 'resource-map.json');
const validate = process.argv.includes('--validate');

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Terraform resource name → CloudFormation resource type
//    This is the only manual mapping needed. Covers all Infracost-supported AWS
//    resources. Add new entries here as Infracost adds resources.
// ═══════════════════════════════════════════════════════════════════════════════
const TF_TO_CFN = {
  aws_instance:                           'AWS::EC2::Instance',
  aws_autoscaling_group:                  'AWS::AutoScaling::AutoScalingGroup',
  aws_ebs_volume:                         'AWS::EC2::Volume',
  aws_ebs_snapshot:                       'AWS::EBS::Snapshot',
  aws_ebs_snapshot_copy:                  'AWS::EBS::Snapshot',
  aws_eip:                                'AWS::EC2::EIP',
  aws_nat_gateway:                        'AWS::EC2::NatGateway',
  aws_ec2_client_vpn_endpoint:            'AWS::EC2::ClientVpnEndpoint',
  aws_ec2_client_vpn_network_association: null, // sub-resource
  aws_ec2_host:                           'AWS::EC2::Host',
  aws_ec2_traffic_mirror_session:         'AWS::EC2::TrafficMirrorSession',
  aws_ec2_transit_gateway_peering_attachment: 'AWS::EC2::TransitGatewayPeeringAttachment',
  aws_ec2_transit_gateway_vpc_attachment: 'AWS::EC2::TransitGatewayAttachment',
  aws_vpn_connection:                     'AWS::EC2::VPNConnection',
  aws_vpc_endpoint:                       'AWS::EC2::VPCEndpoint',
  aws_lb:                                 'AWS::ElasticLoadBalancingV2::LoadBalancer',
  aws_alb:                                'AWS::ElasticLoadBalancingV2::LoadBalancer',
  aws_elb:                                'AWS::ElasticLoadBalancing::LoadBalancer',
  aws_lambda_function:                    'AWS::Lambda::Function',
  aws_lambda_provisioned_concurrency_config: null,
  aws_sfn_state_machine:                  'AWS::StepFunctions::StateMachine',
  aws_ecs_service:                        'AWS::ECS::Service',
  aws_eks_cluster:                        'AWS::EKS::Cluster',
  aws_eks_node_group:                     'AWS::EKS::Nodegroup',
  aws_eks_fargate_profile:                'AWS::EKS::FargateProfile',
  aws_ecr_repository:                     'AWS::ECR::Repository',
  aws_db_instance:                        'AWS::RDS::DBInstance',
  aws_rds_cluster:                        'AWS::RDS::DBCluster',
  aws_rds_cluster_instance:               'AWS::RDS::DBInstance',
  aws_dynamodb_table:                     'AWS::DynamoDB::Table',
  aws_elasticache_cluster:                'AWS::ElastiCache::CacheCluster',
  aws_elasticache_replication_group:      'AWS::ElastiCache::ReplicationGroup',
  aws_docdb_cluster:                      'AWS::DocDB::DBCluster',
  aws_docdb_cluster_instance:             'AWS::DocDB::DBInstance',
  aws_docdb_cluster_snapshot:             null,
  aws_neptune_cluster:                    'AWS::Neptune::DBCluster',
  aws_neptune_cluster_instance:           'AWS::Neptune::DBInstance',
  aws_neptune_cluster_snapshot:           null,
  aws_redshift_cluster:                   'AWS::Redshift::Cluster',
  aws_s3_bucket:                          'AWS::S3::Bucket',
  aws_s3_bucket_analytics_configuration:  null,
  aws_s3_bucket_inventory:                null,
  aws_efs_file_system:                    'AWS::EFS::FileSystem',
  aws_fsx_windows_file_system:            'AWS::FSx::FileSystem',
  aws_fsx_openzfs_file_system:            'AWS::FSx::FileSystem',
  aws_backup_vault:                       'AWS::Backup::BackupVault',
  aws_cloudfront_distribution:            'AWS::CloudFront::Distribution',
  aws_cloudfront_function:                null,
  aws_global_accelerator:                 'AWS::GlobalAccelerator::Accelerator',
  aws_global_accelerator_endpoint_group:  null,
  aws_sqs_queue:                          'AWS::SQS::Queue',
  aws_sns_topic:                          'AWS::SNS::Topic',
  aws_sns_topic_subscription:             null,
  aws_kinesis_stream:                     'AWS::Kinesis::Stream',
  aws_kinesis_firehose_delivery_stream:   'AWS::KinesisFirehose::DeliveryStream',
  aws_kinesisanalyticsv2_application:     'AWS::KinesisAnalyticsV2::Application',
  aws_kinesisanalyticsv2_application_snapshot: null,
  aws_kms_key:                            'AWS::KMS::Key',
  aws_kms_external_key:                   'AWS::KMS::Key',
  aws_secretsmanager_secret:              'AWS::SecretsManager::Secret',
  aws_wafv2_web_acl:                      'AWS::WAFv2::WebACL',
  aws_waf_web_acl:                        'AWS::WAF::WebACL',
  aws_networkfirewall_firewall:           'AWS::NetworkFirewall::Firewall',
  aws_elasticsearch_domain:               'AWS::Elasticsearch::Domain',
  aws_opensearch_domain:                  'AWS::OpenSearchService::Domain',
  aws_msk_cluster:                        'AWS::MSK::Cluster',
  aws_mwaa_environment:                   'AWS::MWAA::Environment',
  aws_glue_job:                           'AWS::Glue::Job',
  aws_glue_crawler:                       'AWS::Glue::Crawler',
  aws_glue_catalog_database:              null,
  aws_route53_zone:                       'AWS::Route53::HostedZone',
  aws_route53_health_check:               'AWS::Route53::HealthCheck',
  aws_route53_record:                     null,
  aws_route53_resolver_endpoint:          'AWS::Route53Resolver::ResolverEndpoint',
  aws_api_gateway_rest_api:               'AWS::ApiGateway::RestApi',
  aws_api_gateway_stage:                  null,
  aws_apigatewayv2_api:                   'AWS::ApiGatewayV2::Api',
  aws_dx_connection:                      'AWS::DirectConnect::Connection',
  aws_dx_gateway_association:             null,
  aws_cloudwatch_dashboard:               'AWS::CloudWatch::Dashboard',
  aws_cloudwatch_log_group:               'AWS::Logs::LogGroup',
  aws_cloudwatch_metric_alarm:            null,
  aws_cloudwatch_event_bus:               null,
  aws_codebuild_project:                  'AWS::CodeBuild::Project',
  aws_transfer_server:                    'AWS::Transfer::Server',
  aws_cloudhsm_v2_hsm:                    'AWS::CloudHSM::Cluster',
  aws_cloudtrail:                         'AWS::CloudTrail::Trail',
  aws_dms_replication_instance:           'AWS::DMS::ReplicationInstance',
  aws_lightsail_instance:                 'AWS::Lightsail::Instance',
  aws_mq_broker:                          'AWS::MQ::Broker',
  aws_grafana_workspace:                  'AWS::Grafana::Workspace',
  aws_directory_service_directory:        'AWS::DirectoryService::MicrosoftAD',
  aws_config_config_rule:                 null,
  aws_config_configuration_recorder:      null,
  aws_ssm_parameter:                      null,
  aws_ssm_activation:                     null,
  aws_acm_certificate:                    null,
  aws_acmpca_certificate_authority:       'AWS::ACMPCA::CertificateAuthority',
  aws_app_autoscaling_target:             null,
  aws_data_transfer:                      null,
  aws_elastic_beanstalk_environment:      null,
  aws_launch_configuration:               null,
  aws_launch_template:                    null,
  aws_search_domain:                      null, // alias for opensearch
};

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Free resources — no direct cost
// ═══════════════════════════════════════════════════════════════════════════════
const FREE = [
  'AWS::IAM::Role','AWS::IAM::Policy','AWS::IAM::ManagedPolicy',
  'AWS::IAM::InstanceProfile','AWS::IAM::User','AWS::IAM::Group',
  'AWS::IAM::AccessKey','AWS::IAM::ServiceLinkedRole',
  'AWS::IAM::OIDCProvider','AWS::IAM::SAMLProvider',
  'AWS::S3::BucketPolicy','AWS::SQS::QueuePolicy',
  'AWS::SNS::TopicPolicy','AWS::SNS::Subscription',
  'AWS::Lambda::Permission','AWS::Lambda::EventSourceMapping',
  'AWS::Lambda::Alias','AWS::Lambda::Version','AWS::Lambda::LayerVersion',
  'AWS::Lambda::EventInvokeConfig',
  'AWS::EC2::SecurityGroup','AWS::EC2::SubnetRouteTableAssociation',
  'AWS::EC2::Route','AWS::EC2::RouteTable',
  'AWS::EC2::Subnet','AWS::EC2::InternetGateway',
  'AWS::EC2::VPCGatewayAttachment','AWS::EC2::NetworkAclEntry',
  'AWS::EC2::NetworkAcl','AWS::EC2::SubnetNetworkAclAssociation',
  'AWS::EC2::PlacementGroup','AWS::EC2::KeyPair','AWS::EC2::LaunchTemplate',
  'AWS::EC2::VPC',
  'AWS::CloudFormation::Stack','AWS::CloudFormation::WaitCondition',
  'AWS::CloudFormation::WaitConditionHandle','AWS::CloudFormation::CustomResource',
  'AWS::CloudFormation::Macro',
  'AWS::CloudWatch::Alarm',
  'AWS::Logs::MetricFilter','AWS::Logs::SubscriptionFilter',
  'AWS::Events::Rule','AWS::Events::EventBus',
  'AWS::ApplicationAutoScaling::ScalableTarget',
  'AWS::ApplicationAutoScaling::ScalingPolicy',
  'AWS::AutoScaling::LaunchConfiguration',
  'AWS::AutoScaling::ScalingPolicy','AWS::AutoScaling::ScheduledAction',
  'AWS::AutoScaling::LifecycleHook',
  'AWS::SSM::Parameter','AWS::SSM::Association','AWS::SSM::Document',
  'AWS::ServiceDiscovery::PrivateDnsNamespace','AWS::ServiceDiscovery::Service',
  'AWS::ECS::TaskDefinition','AWS::ECS::Cluster',
  'AWS::EKS::Addon',
  'AWS::CodeDeploy::Application','AWS::CodeDeploy::DeploymentGroup',
  'AWS::CodePipeline::Pipeline',
  'AWS::CertificateManager::Certificate',
  'AWS::Config::ConfigRule','AWS::Config::ConfigurationRecorder',
  'AWS::Config::DeliveryChannel',
  'AWS::CDK::Metadata',
  'AWS::WAFv2::IPSet','AWS::KMS::Alias','AWS::Glue::Database',
  'Custom::S3AutoDeleteObjects','Custom::VpcRestrictDefaultSG',
  'Custom::AWS','Custom::CrossRegionExportWriter',
];

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Reasonable monthly usage defaults (for usage-based resources)
// ═══════════════════════════════════════════════════════════════════════════════

// ── Curated overrides: unit, multiplier, and filters that can't be reliably
//    auto-parsed from Go source. These always take precedence. ──
const OVERRIDES = {
  'AWS::EC2::Instance': { unit:'Hrs', monthlyHours:730, filters:[
    {Field:'instanceType',Value:{cfProperty:'InstanceType'}},{Field:'operatingSystem',Value:{default:'Linux'}},
    {Field:'tenancy',Value:{default:'Shared'}},{Field:'capacitystatus',Value:{default:'Used'}},
    {Field:'preInstalledSw',Value:{default:'NA'}},{Field:'productFamily',Value:{default:'Compute Instance'}}]},
  'AWS::EC2::NatGateway': { unit:'Hrs', monthlyHours:730, filters:[
    {Field:'productFamily',Value:{default:'NAT Gateway'}},{Field:'group',Value:{default:'NGW:NatGateway'}}]},
  'AWS::EC2::Volume': { unit:'GB-Mo', filters:[
    {Field:'productFamily',Value:{default:'Storage'}},{Field:'volumeApiName',Value:{cfProperty:'VolumeType',default:'gp3'}}]},
  'AWS::EC2::VPNConnection': { unit:'Hrs', monthlyHours:730, filters:[
    {Field:'productFamily',Value:{default:'VPNConnection'}}]},
  'AWS::EC2::TransitGatewayAttachment': { unit:'Hrs', monthlyHours:730, filters:[
    {Field:'productFamily',Value:{default:'TransitGateway'}}]},
  'AWS::EC2::ClientVpnEndpoint': { unit:'Hrs', monthlyHours:730, filters:[
    {Field:'productFamily',Value:{default:'VPNConnection'}},{Field:'usagetype',Value:{default:'USE1-ClientVPN-ConnectionHours'}}]},
  'AWS::EC2::EIP': { unit:'Hrs', monthlyHours:730, filters:[
    {Field:'productFamily',Value:{default:'IP Address'}},{Field:'usagetype',Value:{default:'USE1-PublicIPv4:InUseAddress'}}]},
  'AWS::EC2::VPCEndpoint': { unit:'Hrs', monthlyHours:730, filters:[
    {Field:'productFamily',Value:{default:'VpcEndpoint'}},{Field:'usagetype',Value:{default:'USE1-VpcEndpoint-Hours'}}]},
  'AWS::ElasticLoadBalancingV2::LoadBalancer': { unit:'Hrs', monthlyHours:730, filters:[
    {Field:'productFamily',Value:{default:'Load Balancer-Application'}},{Field:'usagetype',Value:{default:'USE1-LoadBalancerUsage'}}]},
  'AWS::ElasticLoadBalancing::LoadBalancer': { unit:'Hrs', monthlyHours:730, filters:[
    {Field:'productFamily',Value:{default:'Load Balancer'}},{Field:'usagetype',Value:{default:'USE1-LoadBalancerUsage'}}]},
  'AWS::Lambda::Function': { unit:'Lambda-GB-Second', monthlyQuantity:400000, filters:[
    {Field:'productFamily',Value:{default:'Serverless'}},{Field:'group',Value:{default:'AWS-Lambda-Duration'}},
    {Field:'usagetype',Value:{default:'USE1-Lambda-GB-Second'}}]},
  'AWS::StepFunctions::StateMachine': { unit:'StateTransition', monthlyQuantity:10000, filters:[
    {Field:'productFamily',Value:{default:'AWS Step Functions'}},{Field:'usagetype',Value:{default:'USE1-StateTransition'}}]},
  'AWS::ECS::Service': { unit:'Hrs', monthlyHours:730, filters:[
    {Field:'productFamily',Value:{default:'Compute'}},{Field:'usagetype',Value:{default:'USE1-Fargate-vCPU-Hours:perCPU'}}]},
  'AWS::EKS::Cluster': { unit:'Hrs', monthlyHours:730, filters:[
    {Field:'productFamily',Value:{default:'Compute'}},{Field:'usagetype',Value:{default:'USE1-AmazonEKS-Hours:perCluster'}}]},
  'AWS::ECR::Repository': { unit:'GB-Mo', monthlyQuantity:10, filters:[
    {Field:'productFamily',Value:{default:'EC2 Container Registry'}}]},
  'AWS::RDS::DBInstance': { unit:'Hrs', monthlyHours:730, filters:[
    {Field:'productFamily',Value:{default:'Database Instance'}},{Field:'instanceType',Value:{cfProperty:'DBInstanceClass'}},
    {Field:'databaseEngine',Value:{cfProperty:'Engine'}}]},
  'AWS::RDS::DBCluster': { unit:'Hrs', monthlyHours:730, filters:[
    {Field:'productFamily',Value:{default:'Database Instance'}},{Field:'databaseEngine',Value:{cfProperty:'Engine'}}]},
  'AWS::DynamoDB::Table': { unit:'WriteCapacityUnit-Hrs', monthlyHours:730, filters:[
    {Field:'productFamily',Value:{default:'Database'}},{Field:'group',Value:{default:'DDB-WriteUnits'}}]},
  'AWS::ElastiCache::CacheCluster': { unit:'Hrs', monthlyHours:730, filters:[
    {Field:'productFamily',Value:{default:'Cache Instance'}},{Field:'instanceType',Value:{cfProperty:'CacheNodeType'}}]},
  'AWS::ElastiCache::ReplicationGroup': { serviceCode:'AmazonElastiCache', unit:'Hrs', monthlyHours:730, filters:[
    {Field:'productFamily',Value:{default:'Cache Instance'}},{Field:'instanceType',Value:{cfProperty:'CacheNodeType'}}]},
  'AWS::DocDB::DBInstance': { unit:'Hrs', monthlyHours:730, filters:[
    {Field:'productFamily',Value:{default:'Database Instance'}},{Field:'instanceType',Value:{cfProperty:'DBInstanceClass'}}]},
  'AWS::Neptune::DBInstance': { unit:'Hrs', monthlyHours:730, filters:[
    {Field:'productFamily',Value:{default:'Database Instance'}},{Field:'instanceType',Value:{cfProperty:'DBInstanceClass'}}]},
  'AWS::Redshift::Cluster': { unit:'Hrs', monthlyHours:730, filters:[
    {Field:'productFamily',Value:{default:'Compute Instance'}},{Field:'instanceType',Value:{cfProperty:'NodeType'}}]},
  'AWS::S3::Bucket': { unit:'GB-Mo', monthlyQuantity:100, filters:[
    {Field:'productFamily',Value:{default:'Storage'}},{Field:'volumeType',Value:{default:'Standard'}}]},
  'AWS::EFS::FileSystem': { unit:'GB-Mo', monthlyQuantity:100, filters:[
    {Field:'productFamily',Value:{default:'Storage'}},{Field:'usagetype',Value:{default:'USE1-TimedStorage-ByteHrs'}}]},
  'AWS::CloudFront::Distribution': { unit:'Requests', monthlyQuantity:10000000, filters:[
    {Field:'productFamily',Value:{default:'Request'}}]},
  'AWS::SQS::Queue': { unit:'Requests', monthlyQuantity:1000000, filters:[
    {Field:'productFamily',Value:{default:'Queue'}},{Field:'queueType',Value:{default:'Standard'}}]},
  'AWS::SNS::Topic': { unit:'Requests', monthlyQuantity:1000000, filters:[
    {Field:'productFamily',Value:{default:'Message Delivery'}}]},
  'AWS::Kinesis::Stream': { unit:'Shard-Hours', monthlyHours:730, filters:[
    {Field:'productFamily',Value:{default:'Kinesis Streams'}}]},
  'AWS::KinesisFirehose::DeliveryStream': { unit:'GB', monthlyQuantity:100, filters:[
    {Field:'productFamily',Value:{default:'Kinesis Firehose'}}]},
  'AWS::Elasticsearch::Domain': { unit:'Hrs', monthlyHours:730, filters:[
    {Field:'productFamily',Value:{default:'Compute Instance'}},{Field:'instanceType',Value:{cfProperty:'ElasticsearchClusterConfig.InstanceType'}}]},
  'AWS::OpenSearchService::Domain': { unit:'Hrs', monthlyHours:730, filters:[
    {Field:'productFamily',Value:{default:'Compute Instance'}},{Field:'instanceType',Value:{cfProperty:'ClusterConfig.InstanceType'}}]},
  'AWS::MSK::Cluster': { unit:'Hrs', monthlyHours:730, filters:[
    {Field:'productFamily',Value:{default:'Managed Streaming for Apache Kafka (MSK)'}},{Field:'instanceType',Value:{cfProperty:'BrokerNodeGroupInfo.InstanceType'}}]},
  'AWS::MWAA::Environment': { unit:'Hrs', monthlyHours:730, filters:[
    {Field:'productFamily',Value:{default:'Managed Workflows for Apache Airflow'}},{Field:'usagetype',Value:{cfProperty:'EnvironmentClass',default:'USE1-EnvironmentHours:mw1.small'}}]},
  'AWS::KMS::Key': { serviceCode:'awskms', unit:'months', filters:[{Field:'productFamily',Value:{default:'Encryption Key'}}]},
  'AWS::SecretsManager::Secret': { unit:'months', filters:[{Field:'productFamily',Value:{default:'Secret'}}]},
  'AWS::WAFv2::WebACL': { unit:'months', filters:[{Field:'productFamily',Value:{default:'Web Application Firewall'}}]},
  'AWS::Route53::HostedZone': { unit:'months', filters:[
    {Field:'productFamily',Value:{default:'DNS Zone'}},{Field:'usagetype',Value:{default:'HostedZone'}}]},
  'AWS::CloudWatch::Dashboard': { unit:'months', filters:[{Field:'productFamily',Value:{default:'Dashboard'}}]},
  'AWS::Logs::LogGroup': { unit:'GB', monthlyQuantity:10, filters:[
    {Field:'productFamily',Value:{default:'Data Payload'}}]},
  'AWS::MQ::Broker': { unit:'Hrs', monthlyHours:730, filters:[
    {Field:'productFamily',Value:{default:'Broker Instances'}},{Field:'instanceType',Value:{cfProperty:'HostInstanceType'}}]},
  'AWS::DMS::ReplicationInstance': { unit:'Hrs', monthlyHours:730, filters:[
    {Field:'productFamily',Value:{default:'Database Migration'}},{Field:'instanceType',Value:{cfProperty:'ReplicationInstanceClass'}}]},
  'AWS::ApiGateway::RestApi': { unit:'Requests', monthlyQuantity:1000000, filters:[
    {Field:'productFamily',Value:{default:'API Calls'}}]},
  'AWS::ApiGatewayV2::Api': { unit:'Requests', monthlyQuantity:1000000, filters:[
    {Field:'productFamily',Value:{default:'WebSocket'}}]},
  'AWS::Glue::Job': { unit:'DPU-Hour', monthlyHours:20, filters:[
    {Field:'productFamily',Value:{default:'AWS Glue'}},{Field:'usagetype',Value:{default:'USE1-Glue-DPU-Hour'}}]},
  'AWS::Glue::Crawler': { unit:'DPU-Hour', monthlyHours:10, filters:[
    {Field:'productFamily',Value:{default:'AWS Glue'}},{Field:'usagetype',Value:{default:'USE1-Glue-DPU-Hour'}}]},
  'AWS::CodeBuild::Project': { unit:'Minutes', monthlyQuantity:500, filters:[
    {Field:'productFamily',Value:{default:'Compute'}}]},
  'AWS::FSx::FileSystem': { unit:'GB-Mo', monthlyQuantity:1024, filters:[
    {Field:'productFamily',Value:{default:'Storage'}}]},
  'AWS::Backup::BackupVault': { serviceCode:'AWSBackup', unit:'GB-Mo', monthlyQuantity:100, filters:[
    {Field:'productFamily',Value:{default:'AWS Backup Storage'}}]},
};

const DEFAULTS = {
  'AWS::Lambda::Function':       { monthlyQuantity: 400000, note: 'Estimate based on 400k GB-seconds/month' },
  'AWS::S3::Bucket':             { monthlyQuantity: 100, note: 'Estimate based on 100 GB standard storage' },
  'AWS::EFS::FileSystem':        { monthlyQuantity: 100, note: 'Estimate based on 100 GB standard storage' },
  'AWS::FSx::FileSystem':        { monthlyQuantity: 1024, note: 'Estimate based on 1 TB storage' },
  'AWS::CloudFront::Distribution': { monthlyQuantity: 10000000, note: 'Estimate based on 10M requests/month' },
  'AWS::SQS::Queue':             { monthlyQuantity: 1000000, note: 'Estimate based on 1M requests/month' },
  'AWS::SNS::Topic':             { monthlyQuantity: 1000000, note: 'Estimate based on 1M publishes/month' },
  'AWS::KinesisFirehose::DeliveryStream': { monthlyQuantity: 100, note: 'Estimate based on 100 GB ingested/month' },
  'AWS::ECR::Repository':        { monthlyQuantity: 10, note: 'Estimate based on 10 GB stored images' },
  'AWS::Backup::BackupVault':    { monthlyQuantity: 100, note: 'Estimate based on 100 GB backup storage' },
  'AWS::ApiGateway::RestApi':    { monthlyQuantity: 1000000, note: 'Estimate based on 1M API calls/month' },
  'AWS::ApiGatewayV2::Api':      { monthlyQuantity: 1000000, note: 'Estimate based on 1M messages/month' },
  'AWS::StepFunctions::StateMachine': { monthlyQuantity: 10000, note: 'Estimate based on 10k transitions/month' },
  'AWS::Glue::Job':              { monthlyHours: 20, note: 'Estimate based on 20 DPU-hours/month' },
  'AWS::Glue::Crawler':          { monthlyHours: 10, note: 'Estimate based on 10 DPU-hours/month' },
  'AWS::CodeBuild::Project':     { monthlyQuantity: 500, note: 'Estimate based on 500 build-minutes/month' },
  'AWS::DynamoDB::Table':        { note: 'Provisioned WCU cost. On-demand and RCU costs not included.' },
  'AWS::ECS::Service':           { note: 'Fargate vCPU pricing. Estimate based on 1 task running 24/7.' },
  'AWS::EKS::Nodegroup':         { note: 'EKS control plane cost only. Node costs depend on EC2 instance type.' },
  'AWS::RDS::DBCluster':         { note: 'Aurora cluster. Cost per-instance; multiply by instance count.' },
  'AWS::EC2::Volume':            { note: 'EBS volume' },
  'AWS::EC2::EIP':               { note: 'Public IPv4 address cost (since Feb 2024)' },
  'AWS::EC2::VPCEndpoint':       { note: 'Interface endpoint hourly cost. Gateway endpoints are free.' },
  'AWS::KMS::Key':               { note: '$1/month per CMK' },
  'AWS::SecretsManager::Secret': { note: '$0.40/month per secret' },
  'AWS::WAFv2::WebACL':          { note: '$5/month per Web ACL' },
  'AWS::Route53::HostedZone':    { note: '$0.50/month per hosted zone' },
  'AWS::CloudWatch::Dashboard':  { note: '$3/month per dashboard' },
  'AWS::CloudTrail::Trail':      { note: 'First trail in each region is free. Estimate for additional trails.' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Fetch and parse Infracost Go source from GitHub
// ═══════════════════════════════════════════════════════════════════════════════
const INFRACOST_API = 'https://api.github.com/repos/infracost/infracost/contents/internal/resources/aws';
const RAW_BASE = 'https://raw.githubusercontent.com/infracost/infracost/master/internal/resources/aws';

async function fetchJSON(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'resource-map-gen' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function fetchText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'resource-map-gen' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

/** Parse a Go source file for Service and ProductFamily strings */
function parseGoFile(src) {
  const services = new Set();
  const families = new Set();
  const attrs = [];

  // Match: Service: strPtr("AmazonEC2") or Service: strPtr("awskms")
  for (const m of src.matchAll(/Service:\s*strPtr\("([^"]+)"\)/g)) {
    services.add(m[1]);
  }
  // Match: ProductFamily: strPtr("Compute Instance")
  for (const m of src.matchAll(/ProductFamily:\s*strPtr\("([^"]+)"\)/g)) {
    families.add(m[1]);
  }
  // Match attribute filters: {Key: "instanceType", Value: strPtr("...")}
  for (const m of src.matchAll(/Key:\s*"(\w+)",\s*Value:\s*strPtr\("([^"]+)"\)/g)) {
    attrs.push({ key: m[1], value: m[2] });
  }

  return {
    services: [...services],
    families: [...families],
    attrs,
  };
}

/** Derive a Terraform resource name from a Go filename */
function filenameToTfName(filename) {
  return 'aws_' + filename.replace('.go', '');
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Build the resource map
// ═══════════════════════════════════════════════════════════════════════════════
async function buildMap() {
  console.log('Fetching Infracost AWS resource file list...');
  const files = await fetchJSON(INFRACOST_API);
  const goFiles = files
    .filter(f => f.name.endsWith('.go') && !f.name.includes('_test') && !f.name.startsWith('util'))
    .map(f => f.name);

  console.log(`Found ${goFiles.length} Go resource files. Fetching and parsing...`);

  const map = {
    _comment: 'Auto-generated from Infracost source (github.com/infracost/infracost). Run generate-resource-map.mjs to update.',
    _free: FREE,
  };

  let matched = 0, skipped = 0;

  for (const file of goFiles) {
    const tfName = filenameToTfName(file);
    const cfnType = TF_TO_CFN[tfName];

    if (cfnType === undefined) {
      console.log(`  ? ${tfName} (${file}) — no TF→CFN mapping, skipping`);
      skipped++;
      continue;
    }
    if (cfnType === null) {
      // Explicitly marked as sub-resource or not applicable
      skipped++;
      continue;
    }
    if (map[cfnType]) {
      // Already mapped (e.g. aws_alb and aws_lb both map to same CFN type)
      continue;
    }

    const src = await fetchText(`${RAW_BASE}/${file}`);
    const parsed = parseGoFile(src);

    if (parsed.services.length === 0) {
      // No service code in Go source — check if we have a manual override
      if (!OVERRIDES[cfnType]) {
        console.log(`  - ${cfnType} (${file}) — no service code found in source`);
        skipped++;
        continue;
      }
    }

    const serviceCode = parsed.services[0];

    // If we have a curated override, use it (most accurate)
    if (OVERRIDES[cfnType]) {
      const ov = OVERRIDES[cfnType];
      const entry = { serviceCode: ov.serviceCode || serviceCode, unit: ov.unit };
      if (ov.monthlyHours) entry.monthlyHours = ov.monthlyHours;
      if (ov.monthlyQuantity) entry.monthlyQuantity = ov.monthlyQuantity;
      const defs = DEFAULTS[cfnType];
      if (defs?.note) entry.note = defs.note;
      entry.filters = ov.filters;
      map[cfnType] = entry;
      matched++;
      process.stdout.write(`  ✓ ${cfnType} ← override (${entry.serviceCode})\n`);
      continue;
    }

    // Auto-parse: determine unit and multiplier from Go source patterns
    let unit = 'Hrs', mulKey = 'monthlyHours', mulVal = 730;
    const allText = parsed.families.join(' ') + ' ' + parsed.attrs.map(a => a.value).join(' ');

    if (/Storage|GB-Mo|TimedStorage/i.test(allText)) {
      unit = 'GB-Mo'; mulKey = null; mulVal = null;
    } else if (/Request|Queue|Message|Transition/i.test(parsed.families.join(' '))) {
      unit = 'Requests'; mulKey = 'monthlyQuantity'; mulVal = 1000000;
    } else if (/Secret|Encryption Key|DNS Zone|Dashboard|Web Application Firewall/i.test(parsed.families.join(' '))) {
      unit = 'months'; mulKey = null; mulVal = null;
    }

    const productFamily = parsed.families[0] || null;
    const filters = [];
    if (productFamily) {
      filters.push({ Field: 'productFamily', Value: { default: productFamily } });
    }
    for (const attr of parsed.attrs) {
      if (['usagetype','group','volumeApiName','queueType'].includes(attr.key)) {
        if (!attr.value.includes('/') && !attr.value.includes('$')) {
          filters.push({ Field: attr.key, Value: { default: attr.value } });
        }
      }
    }

    const entry = { serviceCode, unit };
    const defs = DEFAULTS[cfnType];
    if (defs) {
      if (defs.monthlyHours) { mulKey = 'monthlyHours'; mulVal = defs.monthlyHours; }
      if (defs.monthlyQuantity) { mulKey = 'monthlyQuantity'; mulVal = defs.monthlyQuantity; }
      if (defs.note) entry.note = defs.note;
    }
    if (mulKey && mulVal) entry[mulKey] = mulVal;
    entry.filters = filters;

    map[cfnType] = entry;
    matched++;
    process.stdout.write(`  ✓ ${cfnType} ← auto (${serviceCode}/${productFamily || '?'})\n`);
  }

  console.log(`\nDone: ${matched} mapped, ${skipped} skipped`);
  return map;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Optional: validate against live AWS Pricing API
// ═══════════════════════════════════════════════════════════════════════════════
async function validateMap(map) {
  const { PricingClient, GetProductsCommand } = await import('@aws-sdk/client-pricing');
  const pricing = new PricingClient({ region: 'us-east-1' });
  const LOCATION = 'US East (N. Virginia)';
  let ok = 0, fail = 0;

  for (const [cfn, entry] of Object.entries(map)) {
    if (cfn.startsWith('_')) continue;
    const filters = entry.filters
      .filter(f => f.Value.default)
      .map(f => ({ Type: 'TERM_MATCH', Field: f.Field, Value: f.Value.default }));
    filters.push({ Type: 'TERM_MATCH', Field: 'location', Value: LOCATION });

    try {
      const resp = await pricing.send(new GetProductsCommand({
        ServiceCode: entry.serviceCode, Filters: filters, MaxResults: 1,
      }));
      if (resp.PriceList?.length > 0) { console.log(`  ✓ ${cfn}`); ok++; }
      else { console.log(`  ✗ ${cfn} — no pricing results`); fail++; }
    } catch (e) {
      console.log(`  ✗ ${cfn} — ${e.message}`); fail++;
    }
  }
  console.log(`\nValidation: ${ok} ok, ${fail} failed`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════════
const map = await buildMap();
const json = JSON.stringify(map, null, 2);
writeFileSync(OUT, json + '\n');

const pricedCount = Object.keys(map).filter(k => !k.startsWith('_')).length;
console.log(`\nWrote ${OUT}`);
console.log(`  Priced: ${pricedCount} | Free: ${map._free.length}`);

if (validate) {
  console.log('\nValidating against AWS Pricing API...\n');
  await validateMap(map);
}
