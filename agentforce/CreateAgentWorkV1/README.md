# CreateAgentWorkV1 Lambda Function

AWS Lambda function that integrates Amazon Connect with Salesforce to create AgentWork records.

## Features

- JWT-based authentication with Salesforce
- SOQL query execution
- AgentWork record creation
- Amazon Connect task management

## Environment Variables

Required environment variables:
- `SF_ENDPOINT`: Salesforce base URL (e.g., https://trailsignup-f20113891f7303.my.salesforce.com)
- `SF_CONSUMER_KEY`: Connected App Consumer Key
- `SF_CONSUMER_SECRET`: Connected App Consumer Secret
- `SF_USERNAME`: Salesforce username
- `SF_PRIVATE_KEY`: Private key for JWT signing (PEM format)
- `INSTANCE_ID`: Amazon Connect instance ID
- `AWS_REGION`: AWS region

## Dependencies

```json
{
  "@aws-sdk/client-connect": "^3.x"
}
```

## Node Version

Requires Node.js >= 18.0.0

## Usage

This Lambda function is designed to be invoked from an Amazon Connect contact flow. It performs the following operations:

1. Authenticates with Salesforce using JWT bearer token flow
2. Executes SOQL queries against Salesforce
3. Creates AgentWork records to route contacts to specific agents
4. Manages Amazon Connect task lifecycle

## Input Parameters

The function expects the following parameters from the Amazon Connect event:

- `SF_UserId`: Salesforce User ID
- `SF_WorkItemId`: Salesforce Work Item ID
- `SF_PendingServiceRoutingId`: Pending Service Routing ID
- `SF_ServiceChannelId`: Service Channel ID
- `ReportingTaskId`: Amazon Connect Task ID

## Response

The function returns a JSON response containing:
- Query results from Salesforce
- AgentWork creation response
- Salesforce instance URL

## Error Handling

The function includes comprehensive error handling for:
- Authentication failures
- SOQL query errors
- AgentWork creation failures
- Amazon Connect API errors

## License

MIT License - See [LICENSE](../../LICENSE) for details
