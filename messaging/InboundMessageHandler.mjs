// Import AWS SDK v3 DynamoDB clients
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
// Import PutCommand, GetCommand and DynamoDBDocumentClient
import { PutCommand, GetCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

// Initialize DynamoDB Client
// Note: Your Lambda execution role MUST have dynamodb:PutItem and dynamodb:GetItem permissions for this to work.
const ddbClient = new DynamoDBClient({});
// Using the Document Client for easier marshalling
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
// Import the crypto module for generating UUIDs
import { randomUUID } from 'crypto';

// --- Environment Variable Helpers ---

/**
 * Fetches an environment variable, throwing an error if it's not set.
 * @param {string} name - The name of the environment variable.
 * @returns {string} The value of the environment variable.
 */
function getEnvVariable(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

// --- Main Lambda Handler ---

/**
 * Main Lambda handler function.
 * Expects event.body to be a JSON string with "mobileNumber" and "text".
 * @param {object} event - The AWS Lambda event object.
 * @param {object} context - The AWS Lambda context object.
 */
export const handler = async (event, context) => {

  console.log('Event: ', event);
  let mobileNumber, text, serviceNumber;

  try {
    // Parse input from event body
    const eventBody = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    
    mobileNumber = eventBody.source;
    text = eventBody.content ?? eventBody.customMessage;
    serviceNumber = eventBody.destination;

    if (!mobileNumber) {
      throw new Error('Missing "mobileNumber" in event body.');
    }
    if (!text) {
      throw new Error('Missing "messageContent" in event body.');
    }
    if (!serviceNumber) {
      throw new Error('Missing "serviceNumber" in event body.');
    }
  } catch (parseError) {
    console.error('Failed to parse event body:', parseError);
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Invalid request payload.',
        details: parseError.message
      })
    };
  }

  try {
    // --- Execute 3-Step Process ---
    const accessToken = await getAccessToken();
    // Get existing or create new conversation
    const conversationId = await getOrCreateConversation(accessToken, mobileNumber, serviceNumber);

    if (serviceNumber == '9999') {
      console.log("First Outbound Message");
    }
    else {
      const messageData = await sendMessage(accessToken, conversationId, text);
    }

    // --- All Steps Successful ---
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Salesforce messaging process completed successfully.',
        conversationId: conversationId,
      })
    };

  } catch (error) {
    console.error('Lambda execution failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to execute Salesforce messaging process.',
        details: error.message
      })
    };
  }
};

/**
 * Step 1: Get Access Token from DynamoDB cache or Salesforce.
 * Reads configuration from environment variables.
 * @returns {Promise<string>} The access token.
 */
async function getAccessToken() {
  console.log('Step 1: Checking for cached access token...');
  const tableName = getEnvVariable('DYNAMODB_TABLE_NAME');
  const tokenCacheKey = 'accessToken'; // The required primary key

  // 1. Try to get the token from DynamoDB
  try {
    const params = {
      TableName: tableName,
      Key: {
        mobileNumber: tokenCacheKey
      }
    };
    const command = new GetCommand(params);
    const data = await ddbDocClient.send(command);

    // 2. Check if item exists (TTL will handle expiry)
    if (data.Item && data.Item.accessToken) {
      console.log('Step 1 Success: Using valid cached access token.');
      return data.Item.accessToken;
    }

    if (data.Item) {
      // This case should ideally not be hit if token is always present, but good to log.
      console.log('Cached token item found, but accessToken property is missing.');
    } else {
      console.log('No cached token found.');
    }

  } catch (error) {
    console.warn('Error fetching token from DynamoDB, will fetch new one:', error.message);
    // Don't re-throw, just proceed to fetch a new token
  }

  // 3. Cache miss or expired: Fetch a new token
  console.log('Fetching new access token from Salesforce...');
  try {
    const newAccessToken = await fetchNewAccessToken();
    console.log('Step 1 Success: New access token received.');
    
    // 4. Save the new token to cache (don't wait for it to complete)
    saveAccessTokenToDynamoDB(newAccessToken, tableName, tokenCacheKey);
    
    return newAccessToken;
  } catch (error) {
    // This is a hard failure (can't get a new token)
    throw new Error(`Step 1 (getAccessToken) failed: ${error.message}`);
  }
}

/**
 * Step 2: Create a new conversation.
 * @param {string} accessToken - The bearer token.
 * @param {string} mobileNumber - The mobile number for routing.
 * @returns {Promise<string>} The new conversation ID.
 */
async function createNewSalesforceConversation(accessToken, mobileNumber, serviceNumber) {
  console.log('Step 2: Creating conversation...');
  const SALESFORCE_API_BASE = getEnvVariable('SALESFORCE_API_BASE');
  const ES_DEVELOPER_NAME = getEnvVariable('ES_DEVELOPER_NAME');
  const LANGUAGE = 'en_US';
  const conversationUUID = randomUUID(); // Generate {{$guid}} for conversationId

  const conversationResponse = await fetch(`${SALESFORCE_API_BASE}/conversation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      conversationId: conversationUUID,
      routingAttributes: {
        mobileNumber: mobileNumber,
        serviceNumber: serviceNumber 
      },
      esDeveloperName: ES_DEVELOPER_NAME,
      language: LANGUAGE
    })
  });

  if (!conversationResponse.ok) {
    const errorBody = await conversationResponse.text();
    throw new Error(`Step 2 (createConversation) failed: ${conversationResponse.statusText} - ${errorBody}`);
  }

  // Expect 201 Created with no payload
  if (conversationResponse.status !== 201) {
    const errorBody = await conversationResponse.text();
    throw new Error(`Step 2 (createConversation) failed: Expected status 201, got ${conversationResponse.status} - ${errorBody}`);
  }
  
  // After successful conversation creation, save to DynamoDB
  await saveToDynamoDB(conversationUUID, mobileNumber, serviceNumber);

  // On success (201), return the UUID we sent, as there's no response body.
  console.log(`Step 2 Success: Conversation created with ID: ${conversationUUID}`);
  return conversationUUID;
}

/**
 * Step 3: Send a message to the conversation.
 * @param {string} accessToken - The bearer token.
 * @param {string} conversationId - The ID of the conversation.
 * @param {string} text - The message text to send.
 * @returns {Promise<object>} The JSON response from the send message API.
 */
async function sendMessage(accessToken, conversationId, text) {
  console.log('Step 3: Sending message...');
  const SALESFORCE_API_BASE = getEnvVariable('SALESFORCE_API_BASE');
  const ES_DEVELOPER_NAME = getEnvVariable('ES_DEVELOPER_NAME');
  const LANGUAGE = 'en_US';

  const messageUUID = randomUUID(); // Generate {{$guid}} for message id

  const messageResponse = await fetch(`${SALESFORCE_API_BASE}/conversation/${conversationId}/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      message: {
        id: messageUUID,
        messageType: 'StaticContentMessage',
        staticContent: {
          formatType: 'Text',
          text: text // Use text from event
        }
      },
      isNewMessagingSession: false,
      esDeveloperName: ES_DEVELOPER_NAME,
      language: LANGUAGE
    })
  });

  // Expect 202 Accepted with a payload
  if (messageResponse.status !== 202) {
    const errorBody = await messageResponse.text();
    throw new Error(`Step 3 (sendMessage) failed: Expected status 202, got ${messageResponse.status} - ${errorBody}`);
  }

  const messageData = await messageResponse.json();
  console.log('Step 3 Success: Message sent.');
  console.log('messageData: ', messageData);
  return messageData;
}

/**
 * New Function: Save conversation details to DynamoDB.
 * @param {string} conversationId - The conversation ID (Primary Key).
 * @param {string} mobileNumber - The source mobile number.
 * @param {string} messageContent - The message text.
 * @param {string} serviceNumber - The destination service number.
 */
async function saveToDynamoDB(conversationId, mobileNumber, messageContent, serviceNumber) {
  console.log(`Saving conversation ${conversationId} to DynamoDB...`);
  const tableName = getEnvVariable('DYNAMODB_TABLE_NAME');
  
  const now = new Date();
  // Epoch time in seconds for TTL (current time + 1 hour)
  const expiryDateTime = Math.floor(now.getTime() / 1000) + 3600; 
  // ISO 8601 string for created date
  const createdDateTime = now.toISOString();

  const params = {
    TableName: tableName,
    Item: {
      mobileNumber: mobileNumber, // Primary Key
      conversationId: conversationId,
      serviceNumber: serviceNumber,
      createdDateTime: createdDateTime,
      expiryDateTime: expiryDateTime // Used for DynamoDB TTL
    }
  };

  try {
    const command = new PutCommand(params);
    await ddbDocClient.send(command);
    console.log('Successfully saved to DynamoDB.');
  } catch (error) {
    console.error('Error saving to DynamoDB:', error);
    // Continue execution even if DynamoDB save fails, but log the error.
    // You could choose to throw the error here if you want the Lambda to fail.
    // throw new Error(`Failed to save to DynamoDB: ${error.message}`);
  }
}

/**
 * Saves the access token to DynamoDB for caching.
 * This runs in the background and does not block the main flow.
 * @param {string} accessToken - The token to save.
 * @param {string} tableName - The DynamoDB table name.
 * @param {string} tokenCacheKey - The primary key ('accessToken').
 */
async function saveAccessTokenToDynamoDB(accessToken, tableName, tokenCacheKey) {
  console.log('Caching new access token to DynamoDB...');
  const now = new Date();
  // Epoch time in seconds for TTL (current time + 1 hour)
  const expiryDateTime = Math.floor(now.getTime() / 1000) + 3600; 
  // ISO 8601 string for created date
  const createdDateTime = now.toISOString();

  const params = {
    TableName: tableName,
    Item: {
      mobileNumber: tokenCacheKey, // Primary Key
      accessToken: accessToken,
      createdDateTime: createdDateTime,
      expiryDateTime: expiryDateTime // Used for DynamoDB TTL
    }
  };

  try {
    const command = new PutCommand(params);
    await ddbDocClient.send(command);
    console.log('Successfully cached access token.');
  } catch (error) {
    console.error('Error caching access token to DynamoDB:', error);
    // Do not re-throw, as the main flow already has the token.
  }
}

/**
 * Fetches a new access token directly from Salesforce.
 * @returns {Promise<string>} The access token.
 */
async function fetchNewAccessToken() {
  const SALESFORCE_API_BASE = getEnvVariable('SALESFORCE_API_BASE');
  const ORG_ID = getEnvVariable('ORG_ID');
  const ES_DEVELOPER_NAME = getEnvVariable('ES_DEVELOPER_NAME');
  const CAPABILITIES_VERSION = getEnvVariable('CAPABILITIES_VERSION');
  const PLATFORM = getEnvVariable('PLATFORM');

  const tokenResponse = await fetch(`${SALESFORCE_API_BASE}/authorization/unauthenticated/access-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      orgId: ORG_ID,
      esDeveloperName: ES_DEVELOPER_NAME,
      capabilitiesVersion: CAPABILITIES_VERSION,
      platform: PLATFORM
    })
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    throw new Error(`(fetchNewAccessToken) failed: ${tokenResponse.statusText} - ${errorBody}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.accessToken;
}

/**
 * Step 2: Get existing conversationId from DDB or create a new one.
 * @param {string} accessToken - The bearer token.
 * @param {string} mobileNumber - The mobile number (DDB Key).
 * @param {string} serviceNumber - The destination service number.
 * @returns {Promise<string>} The conversation ID.
 */
async function getOrCreateConversation(accessToken, mobileNumber, serviceNumber) {
  console.log('Step 2: Checking for existing conversation...');
  const tableName = getEnvVariable('DYNAMODB_TABLE_NAME');

  // 1. Try to get the conversation from DynamoDB
  try {
    const params = {
      TableName: tableName,
      Key: {
        mobileNumber: mobileNumber
      }
    };
    const command = new GetCommand(params);
    const data = await ddbDocClient.send(command);

    // 2. Check if item exists (TTL will handle expiry)
    if (data.Item && data.Item.conversationId) {
      console.log('Step 2 Success: Using existing conversationId:', data.Item.conversationId);
      return data.Item.conversationId;
    }
    
    console.log('Step 2: No existing conversation found.');

  } catch (error) {
    console.warn('Error fetching conversation from DynamoDB, will create new one:', error.message);
    // Don't re-throw, just proceed to create a new conversation
  }

  // 3. Cache miss: Create a new conversation and save it
  try {
    console.log('Creating new conversation...');
    const newConversationId = await createNewSalesforceConversation(accessToken, mobileNumber, serviceNumber);
    await saveToDynamoDB(newConversationId, mobileNumber, serviceNumber);
    console.log('Step 2 Success: New conversation created and saved.');
    return newConversationId;
  } catch (error) {
     throw new Error(`Step 2 (getOrCreateConversation) failed: ${error.message}`);
  }
}
