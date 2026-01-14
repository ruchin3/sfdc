import crypto from 'crypto';
import https from 'https';
import { URLSearchParams } from 'url';
import { ConnectClient, StopContactCommand } from "@aws-sdk/client-connect";
const client = new ConnectClient({ region: process.env.AWS_REGION });
const INSTANCE_ID = process.env.INSTANCE_ID;

// Environment variables needed:
// - SF_ENDPOINT: Salesforce base URL (e.g., https://trailsignup-f20113891f7303.my.salesforce.com)
// - SF_CONSUMER_KEY: Connected App Consumer Key
// - SF_CONSUMER_SECRET: Connected App Consumer Secret
// - SF_USERNAME: Salesforce username
// - SF_PRIVATE_KEY: Private key for JWT signing (PEM format)

/**
 * Base64URL encode a string or buffer
 */
function base64urlEncode(str) {
  const base64 = Buffer.from(str).toString('base64');
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate JWT token for Salesforce OAuth using crypto module
 */
function generateJWT() {
  // Handle private key - replace escaped newlines with actual newlines
  let privateKeyPem = process.env.SF_PRIVATE_KEY.replace(/\\n/g, '\n');
  
  // Remove any extra spaces within the key content (common issue when copy/pasting)
  // This handles keys that have spaces instead of newlines in the base64 content
  privateKeyPem = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----\s*/g, '-----BEGIN PRIVATE KEY-----\n')
    .replace(/\s*-----END PRIVATE KEY-----/g, '\n-----END PRIVATE KEY-----')
    .replace(/-----BEGIN RSA PRIVATE KEY-----\s*/g, '-----BEGIN RSA PRIVATE KEY-----\n')
    .replace(/\s*-----END RSA PRIVATE KEY-----/g, '\n-----END RSA PRIVATE KEY-----');
  
  // Extract the base64 content between BEGIN and END markers
  const beginMarker = privateKeyPem.includes('BEGIN RSA') ? '-----BEGIN RSA PRIVATE KEY-----' : '-----BEGIN PRIVATE KEY-----';
  const endMarker = privateKeyPem.includes('END RSA') ? '-----END RSA PRIVATE KEY-----' : '-----END PRIVATE KEY-----';
  
  const beginIndex = privateKeyPem.indexOf(beginMarker);
  const endIndex = privateKeyPem.indexOf(endMarker);
  
  if (beginIndex !== -1 && endIndex !== -1) {
    // Extract base64 content
    let base64Content = privateKeyPem.substring(beginIndex + beginMarker.length, endIndex);
    // Remove all whitespace (spaces, newlines, tabs)
    base64Content = base64Content.replace(/\s+/g, '');
    
    // Reconstruct with proper line breaks (64 characters per line is standard)
    let formattedBase64 = '';
    for (let i = 0; i < base64Content.length; i += 64) {
      formattedBase64 += base64Content.substring(i, i + 64) + '\n';
    }
    
    // Reconstruct the full PEM
    privateKeyPem = `${beginMarker}\n${formattedBase64}${endMarker}\n`;
  }
  
  console.log('Formatted private key starts with:', privateKeyPem.substring(0, 80));
  
  // Create JWT header
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };
  
  // Create JWT payload
  const payload = {
    iss: process.env.SF_CONSUMER_KEY,
    sub: process.env.SF_USERNAME,
    aud: process.env.SF_ENDPOINT,
    exp: Math.floor(Date.now() / 1000) + 300 // 5 minutes expiration
  };

  // Encode header and payload
  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  
  // Create signature
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  
  try {
    // Try to create a proper private key object
    const privateKeyObject = crypto.createPrivateKey({
      key: privateKeyPem,
      format: 'pem'
    });
    
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signatureInput);
    signer.end();
    
    const signature = signer.sign(privateKeyObject);
    const encodedSignature = base64urlEncode(signature);
    
    // Return complete JWT
    return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
  } catch (error) {
    console.error('Error creating private key:', error.message);
    console.error('Key format detected:', privateKeyPem.substring(0, 150));
    throw new Error(`Failed to parse private key: ${error.message}. Make sure SF_PRIVATE_KEY is in valid PEM format.`);
  }
}

/**
 * Exchange JWT for Salesforce access token
 */
async function getSalesforceAccessToken() {
  const jwtToken = generateJWT();
  const authUrl = new URL(`${process.env.SF_ENDPOINT}/services/oauth2/token`);
  
  const postData = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwtToken
  }).toString();

  const options = {
    hostname: authUrl.hostname,
    port: 443,
    path: authUrl.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          const tokenData = JSON.parse(data);
          resolve({
            accessToken: tokenData.access_token,
            instanceUrl: tokenData.instance_url || process.env.SF_ENDPOINT
          });
        } else {
          reject(new Error(`Authentication failed: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Execute SOQL query against Salesforce
 */
async function executeSoqlQuery(accessToken, instanceUrl, query) {
  const encodedQuery = encodeURIComponent(query);
  const queryUrl = new URL(`${instanceUrl}/services/data/v58.0/query?q=${encodedQuery}`);

  const options = {
    hostname: queryUrl.hostname,
    port: 443,
    path: queryUrl.pathname + queryUrl.search,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`SOQL query failed: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

/**
 * Make REST API call to Salesforce
 */
async function callSalesforceApi(accessToken, instanceUrl, method, endpoint, body = null) {
  const apiUrl = new URL(`${instanceUrl}${endpoint}`);

  const options = {
    hostname: apiUrl.hostname,
    port: 443,
    path: apiUrl.pathname + apiUrl.search,
    method: method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  };

  if (body) {
    const postData = JSON.stringify(body);
    options.headers['Content-Length'] = Buffer.byteLength(postData);
  }

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data ? JSON.parse(data) : {});
        } else {
          reject(new Error(`API call failed: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

export const handler = async (event) => {
  console.log("Event: ", JSON.stringify(event, null, 2));

  const UserId = event.Details?.ContactData?.Attributes?.SF_UserId;
  const WorkItemId = event.Details?.ContactData?.Attributes?.SF_WorkItemId;
  const PendingServiceRoutingId = event.Details?.ContactData?.Attributes?.SF_PendingServiceRoutingId;
  const ServiceChannelId = event.Details?.ContactData?.Attributes?.SF_ServiceChannelId;
  const ReportingTaskId = event.Details?.Parameters?.ReportingTaskId;

  console.log("UserId: ", UserId);
  console.log("WorkItemId: ", WorkItemId);
  console.log("PendingServiceRoutingId: ", PendingServiceRoutingId);
  console.log("ServiceChannelId: ", ServiceChannelId);
  console.log("ReportingTaskId: ", ReportingTaskId);
    
  //const UserId = '005J1000001BIoF';
  //const WorkItemId = '0MwJ1000000U2WnKAK';
  //const PendingServiceRoutingId = '0JRJ10000031cmXOAQ';



  try {

    // 1. Extract parameters from Amazon Connect Flow

    // Hardcoded SOQL query for testing
    const soqlQuery = "SELECT Name FROM Contact WHERE Id = '003J100000BaKhJIAV'";

    // 2. Authenticate with Salesforce using JWT bearer token
    console.log('Authenticating with Salesforce...');
    const { accessToken, instanceUrl } = await getSalesforceAccessToken();
    console.log('Successfully authenticated with Salesforce');

    // 3. Execute SOQL query
    let queryResults = null;
    console.log(`Executing SOQL query: ${soqlQuery}`);
    queryResults = await executeSoqlQuery(accessToken, instanceUrl, soqlQuery);
    console.log(`Query returned ${queryResults.totalSize} records`);

    // 4. Create AgentWork if parameters are provided
    let agentWorkResponse = null;
    if (UserId && WorkItemId && PendingServiceRoutingId) {
      const payload = {
        ServiceChannelId: ServiceChannelId, // Update with actual ServiceChannelId
        UserId: UserId,
        WorkItemId: WorkItemId,
        PendingServiceRoutingId: PendingServiceRoutingId
      };

      console.log('Creating AgentWork in Salesforce...');
      agentWorkResponse = await callSalesforceApi(
        accessToken,
        instanceUrl,
        'POST',
        '/services/data/v58.0/sobjects/AgentWork',
        payload
      );
      console.log('AgentWork created successfully');
      await StopContact(ReportingTaskId);
    }

    // 5. Return response
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Success',
        queryResults: queryResults,
        agentWorkResponse: agentWorkResponse,
        instanceUrl: instanceUrl
      })
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error processing request',
        error: error.message
      })
    };
  }

  
};

async function StopContact(ReportingTaskId) {


  const input = {
    InstanceId: INSTANCE_ID,
    ContactId: ReportingTaskId
  };

  try {
    const command = new StopContactCommand(input);
    const response = await client.send(command);

    console.log("StopContactCommand response:", JSON.stringify(response, null, 2));

    console.log("Task stopped successfully.");

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Task stopped successfully",
        contactId: response.ContactId
      }),
    };

  } catch (error) {
    console.error("Error stopping task contact:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }

}
