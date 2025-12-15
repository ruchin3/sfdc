import { 
  ConnectClient, 
  StartChatContactCommand, 
  StartContactStreamingCommand 
} from "@aws-sdk/client-connect";
import { 
  ConnectParticipantClient, 
  CreateParticipantConnectionCommand, 
  SendMessageCommand 
} from "@aws-sdk/client-connectparticipant";
import { 
  DynamoDBClient, 
  GetItemCommand, 
  PutItemCommand 
} from "@aws-sdk/client-dynamodb";

// Initialize Clients
const connectClient = new ConnectClient({});
const participantClient = new ConnectParticipantClient({});
const dynamoClient = new DynamoDBClient({});

const DYNAMO_TABLE_NAME = process.env.DYNAMO_TABLE_NAME; 

export const handler = async (event) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  const { rawPath, body } = event; // Or JSON.parse(event.body) if via API Gateway
  const parsedBody = body ? JSON.parse(body) : {};
  console.log("ParsedBody: ", JSON.stringify(parsedBody));
  let firstMessage;
  let originatingNumber;
  let destinationNumber;
  let content;

  if (rawPath === "/salesforce") {
    firstMessage = parsedBody.firstMessage;
    originatingNumber = parsedBody.originatingNumber;
    content = parsedBody.content;
    console.log("First Message:", firstMessage);
    console.log("Customer Number: ", originatingNumber);  
    console.log("Message Content: ", content);
    if (!originatingNumber || !firstMessage) {
      console.log("Missing originatingNumber or firstMessage");
      return { statusCode: 400, body: "Missing data" };
    } 
    else console.log("Request from Salesforce");
  }
  else if (rawPath === "/modica") {
    originatingNumber = parsedBody.source;
    destinationNumber = parsedBody.destination;
    content = parsedBody.content;
    console.log("Customer Number: ", originatingNumber);  
    console.log("Destination Number: ", destinationNumber);  
    console.log("Message Content: ", content);
  
    if (!originatingNumber || !destinationNumber) {
      console.log("Missing originatingNumber or destinationNumber");
      return { statusCode: 400, body: "Missing data" };
    } 
    else console.log("Request from Modica");
  }
  else {
      console.log("Invalid Request");
      return { statusCode: 400, body: "Missing data" };
  }

  // 1. Parse Request

  if (!firstMessage) {
    firstMessage = "0";
    console.log("FirstMessage not received: ", firstMessage);
  }
  
  try {
    // ---------------------------------------------------------
    // Step 2: Check for an ACTIVE session in DynamoDB
    // ---------------------------------------------------------
    const dbParams = {
      TableName: DYNAMO_TABLE_NAME,
      Key: { "originatingNumber": { S: originatingNumber } }
    };
    const dbResponse = await dynamoClient.send(new GetItemCommand(dbParams));

    // Variable to hold the ID for rehydration if reuse fails
    let previousContactId = null;
    
    // If we found a session, try to reuse it
    if (dbResponse.Item && dbResponse.Item.ConnectionToken) {
      const storedToken = dbResponse.Item.ConnectionToken.S;
      previousContactId = dbResponse.Item.ContactId.S;

      console.log(`Found existing session: ${previousContactId}. Attempting to reuse...`);

      try {
        const sendResponse = await participantClient.send(new SendMessageCommand({
          ContentType: "text/plain",
          Content: content,
          ConnectionToken: storedToken
        }));

        console.log("Success! Message sent to existing session.");
        return { statusCode: 200, body: JSON.stringify({ status: "Resumed", messageId: sendResponse.Id }) };

      } catch (err) {
        console.warn("Failed to reuse session (Expired or Ended). Creating new one...", err.name);
        // If this fails (e.g. AccessDeniedException), the chat is dead. We proceed to create a new one below.
      }
    }

    // ---------------------------------------------------------
    // Step 3: Create NEW Session (If no active session or reuse failed)
    // ---------------------------------------------------------
    console.log("Creating NEW Chat Session...");

    // 1. Prepare Base Parameters
    const startChatParams = {
      InstanceId: process.env.CONNECT_INSTANCE_ID,
      ContactFlowId: process.env.CONTACT_FLOW_ID,
      Attributes: { 
        "CustomerNumber": originatingNumber,
        "FirstMessage": firstMessage 
      },
      ParticipantDetails: { DisplayName: originatingNumber }
    };

    // 2. [NEW] Add Rehydration Logic
    // If we have a previous ContactId (from the failed reuse attempt), request history.

    console.log(`Previous contactId: ${previousContactId}.`);

    if (previousContactId) {
        console.log(`Requesting Chat Rehydration from SourceContactId: ${previousContactId}`);
        startChatParams.PersistentChat = {
            RehydrationType: "FROM_SEGMENT",
            SourceContactId: previousContactId
        };
    }

    // 3. Send Command
    const startChatResp = await connectClient.send(new StartChatContactCommand(startChatParams));

    const { ContactId, ParticipantToken } = startChatResp;

    // B. Enable Streaming
    const streamingResult = await connectClient.send(new StartContactStreamingCommand({
      InstanceId: process.env.CONNECT_INSTANCE_ID,
      ContactId: ContactId,
      ChatStreamingConfiguration: { StreamingEndpointArn: process.env.SNS_STREAMING_ARN }
    }));

    console.log("Streaming Result: ", JSON.stringify(streamingResult));

    // C. Create Connection to get Token
    const connectionResp = await participantClient.send(new CreateParticipantConnectionCommand({
      ParticipantToken: ParticipantToken,
      Type: ["CONNECTION_CREDENTIALS"],
      ConnectParticipant: true
    }));

    const newToken = connectionResp.ConnectionCredentials.ConnectionToken;

    // D. Send the First Customer Message, skip if this is the first message from agent
    
    if (firstMessage === "0") {
      const msgResp = await participantClient.send(new SendMessageCommand({
        ContentType: "text/plain",
        Content: content,
        ConnectionToken: newToken
      }));
  
      console.log("Message Sent");  
    }
// ---------------------------------------------------------
    // Step 4: Save new session to DynamoDB for next time
    // ---------------------------------------------------------
    
    // 1. Get TTL configuration (default to 24 hours if not set)
    const ttlHours = parseInt(process.env.SESSION_TTL_HOURS) || 24;
    
    // 2. Calculate Expiry Timestamp (Current Time in Seconds + Hours * 3600)
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const expirationTime = nowInSeconds + (ttlHours * 3600);

    await dynamoClient.send(new PutItemCommand({
      TableName: DYNAMO_TABLE_NAME,
      Item: {
        "originatingNumber": { S: originatingNumber },
        "ContactId": { S: ContactId },
        "ConnectionToken": { S: newToken },
        "expiryDateTime": { N: expirationTime.toString() } 
      }
    }));

    return { statusCode: 200, body: JSON.stringify({ status: "Created entry in DDB", contactId: ContactId }) };

  } catch (error) {
    console.error("Critical Error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
