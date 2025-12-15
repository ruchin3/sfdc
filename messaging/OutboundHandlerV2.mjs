import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

// Initialize DynamoDB Client
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const apiUser = process.env.API_USER;
const apiPass = process.env.API_PASS;

export const handler = async (event) => {

  console.log(event);
  
  try {
    // 1. Get the SNS message string from the first record
    const snsMessageString = event.Records[0].Sns.Message;

    // 2. Parse the string into a usable JavaScript object
    const messageData = JSON.parse(snsMessageString);

    // 3. Destructure the required fields (added ContentType)
    const { ContactId, ParticipantRole, Content, ContentType, Type } = messageData; 

//    console.log("Extracted Data:", { ContactId, ParticipantRole, Content, ContentType, Type });

    if (Type == 'MESSAGE' && ParticipantRole == 'AGENT') {
      console.log("Agent Message Detected");
      const originatingNumber = await getOriginatingNumber(ContactId);
      console.log("Customer Number: ", originatingNumber);
      console.log("Message: ", Content);
      await SendOutboundMessage(originatingNumber, Content);
    }
  } catch (error) {
    console.error("Error parsing SNS message:", error);
    return { statusCode: 500, body: "Error processing message" };
  }
};

// Helper function to query DynamoDB
const getOriginatingNumber = async (contactId) => {
  const command = new QueryCommand({
    TableName: process.env.TABLE_NAME, // e.g., "MyContactsTable"
    IndexName: process.env.GSI_NAME,   // e.g., "ContactId-Index"
    KeyConditionExpression: "ContactId = :cid",
    ExpressionAttributeValues: {
      ":cid": contactId,
    },
    // Only fetch the field we need to save read capacity
    ProjectionExpression: "originatingNumber",
  });

  const response = await docClient.send(command);

  // Check if we found any items
  if (response.Items && response.Items.length > 0) {
    return response.Items[0].originatingNumber;
  }
  return null;
};

async function SendOutboundMessage (customerNumber, contentBody) {

  console.log("Sending outbound message");

  try {
    //Lookup phone number from ContactId to phone number mapping stored by Inbound_SMS lambda
    const apiResponseData = await makeApiRequest(customerNumber, contentBody);

    console.log("Successfully received data from external API.");

    console.log(apiResponseData);

    return {
        statusCode: 202,
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            message: "Successfully sent POST request!",
            data: apiResponseData,
        }),
    };
    } catch (error) {
        console.error("Error making API request:", error);

        return {
            statusCode: 500,
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                message: "Failed to send POST request to the external API.",
                error: error.message,
            }),
        };
    }

};

async function makeApiRequest(customerNumber, contentBody) {
  const postData = JSON.stringify({
      destination: customerNumber,
      content: contentBody
  });

  const username = apiUser;
  const password = apiPass;
  const basicAuth = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');

    const url = 'https://api.modicagroup.com/rest/sms/v2/messages'; 
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': basicAuth
        },
        body: postData
    };

    try {
        console.log(`Making POST request to ${url}`);
        const response = await fetch(url, options);

        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
        }
        
        const responseText = await response.text();

        if (responseText) {
            return JSON.parse(responseText);
        } else {
            return { message: "Request successful with no response body." };
        }

    } catch (error) {
        console.error("Fetch API call failed:", error);
        throw error;
    }
}
