// AWS integration for the API: credentials, SES and SSM secrets.
// Startup imports ./ssmSecrets directly, because it must run before ../config is loaded.
export { awsCredentialMode, awsCredentials, type AwsCredentialMode } from './credentials';
export { getSesClient } from './sesClient';
export { loadSecrets } from './ssmSecrets';
