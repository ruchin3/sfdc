import { ConnectClient, StartTaskContactCommand } from "@aws-sdk/client-connect";
import crypto from 'crypto';
const client = new ConnectClient({ region: process.env.AWS_REGION });

// Retrieve static configuration from Environment Variables
const INSTANCE_ID = process.env.INSTANCE_ID;
const CONTACT_FLOW_ID = process.env.CONTACT_FLOW_ID;

export const handler = async (event) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  // 1. Validation for Env Vars
  if (!INSTANCE_ID || !CONTACT_FLOW_ID) {
    throw new Error("Configuration Error: INSTANCE_ID or CONTACT_FLOW_ID environment variables are missing.");
  }

  // 2. Parse the 'body' string to get the nested JSON object
  let parsedBody;
  try {
    // If body is already an object, use it; otherwise parse the string
    parsedBody = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  } catch (e) {
    console.error("Failed to parse event body", e);
    return { statusCode: 400, body: "Invalid JSON in body" };
  }

  // 3. Extract the specific fields
  // Note: We use optional chaining (?.) to prevent crashes if fields are missing
  const eventType = parsedBody?.eventType;
  const psr = parsedBody?.pendingServiceRouting || {};
  
  const extractedData = {
    eventType: eventType,
    Id: psr.Id,
    WorkItemId: psr.WorkItemId,
    ServiceChannelId: psr.ServiceChannelId
  };

  console.log("Extracted Data:", extractedData);

  // 4. Map extracted data to Connect Task Attributes
  // We pass these to Connect so you can use them in the Flow (e.g. $.Attributes.SF_WorkItemId)
  const taskAttributes = {
    "SF_EventType": extractedData.eventType || "Unknown",
    "SF_PendingServiceRoutingId": extractedData.Id || "",
    "SF_WorkItemId": extractedData.WorkItemId || "",
    "SF_ServiceChannelId": extractedData.ServiceChannelId || "",
    "SF_UserId": "005J1000001BIoF",
    ...event.attributes // Merge with any other top-level attributes if they exist
  };

  // 5. Construct the API parameters
  const input = {
    InstanceId: INSTANCE_ID,
    ContactFlowId: CONTACT_FLOW_ID,
    Name: `Task for ${extractedData.WorkItemId}`,
    Description: `Salesforce Event: ${extractedData.eventType}`,
    Attributes: taskAttributes,
    ClientToken: crypto.randomUUID()
  };

  if ( extractedData.eventType === "CREATE") 
  {
    console.log("Calling StartTaskContact");
    await StartTaskContact(input);
  }
  else {
    console.log("Skipping event");
  }

};

async function StartTaskContact(input) {

  try {
    const command = new StartTaskContactCommand(input);
    const response = await client.send(command);

    console.log("Task created successfully. ContactId:", response.ContactId);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Task initiated successfully",
        contactId: response.ContactId
      }),
    };

  } catch (error) {
    console.error("Error starting task contact:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }

}
