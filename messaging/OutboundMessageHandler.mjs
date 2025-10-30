/**
 * Main Lambda Handler
 */
export const handler = async (event) => {
    console.log('Event: ', event);
    let mobileNumber, conversationIdentifier;

    const eventBody = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    mobileNumber = eventBody.mobileNumber;
    conversationIdentifier = eventBody.conversationIdentifier;

    if (!mobileNumber) {
        return {
            statusCode: 200,
            body: 'Mobile Number not provided'
        };
          }
    if (!conversationIdentifier) {
        return {
            statusCode: 200,
            body: 'ConversationIdentifier not provided'
        };
          }
  
    try {
        // Step 1: Get Access Token
        const accessToken = await getAccessToken();

        // Step 2: Use access token to get data
        const data = await getConversationEntry(accessToken, conversationIdentifier);

        // Step 3: Extract required fields
        if (!data.conversationEntries || data.conversationEntries.length === 0) {
            return {
                statusCode: 404,
                body: JSON.stringify({ message: "No conversation entries found." }),
            };
        }

        const firstEntry = data.conversationEntries[0];
        const sender = firstEntry.sender || {};

        const extractedData = {
            messageText: firstEntry.messageText,
            messagingSessionId: firstEntry.relatedRecords[0],
            appType: sender.appType,
            role: sender.role,
        };

        console.log("Successfully extracted data:", JSON.stringify(extractedData));

        // New Logic: If role is 'Agent', call the POST function
        if (extractedData.role === 'Agent') {
            console.log("Role is 'Agent', attempting to send outbound SMS request.");
            // Call the new function. await ensures it completes or throws an error.
            const postResponseData = await sendPostRequest(mobileNumber, extractedData.messageText);
            console.log('Sending SMS status: ', postResponseData);
            return {
                statusCode: 200, // Status 200 indicates success for the Lambda execution
                body: JSON.stringify(postResponseData) // This is the JSON body from the POST call
            };
        }

        // Success response
        return {
            statusCode: 200,
            body: JSON.stringify(extractedData)
        };

    } catch (error) {
        console.error("An error occurred in the handler:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: "Internal Server Error",
                error: error.message,
            }),
        };
    }
};

/**
 * Step 1: Get Access Token
 * Fetches an OAuth access token using client credentials.
 */
async function getAccessToken() {
    const clientId = process.env.CLIENT_ID;
    const clientSecret = process.env.CLIENT_SECRET;
    const baseUrl = process.env.SALESFORCE_BASE_URL;

    if (!clientId || !clientSecret || !baseUrl) {
        throw new Error("Missing required environment variables: CLIENT_ID, CLIENT_SECRET, or SALESFORCE_BASE_URL");
    }
    
    // Construct the full token URL from the base URL
    const tokenUrl = `${baseUrl}/services/oauth2/token`;

    // Basic Auth header requires a base64 encoding of client:secret
    const authHeader = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    // The body must be URL-encoded
    const bodyParams = new URLSearchParams();
    bodyParams.append('grant_type', 'client_credentials');

    try {
        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: bodyParams.toString(),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Failed to get access token: ${response.status} ${response.statusText} - ${errorBody}`);
        }

        const data = await response.json();
        if (!data.access_token) {
            throw new Error("Access token not found in response");
        }
        
        console.log("Successfully retrieved access token.");
        return data.access_token;

    } catch (error) {
        console.error("Error in getAccessToken:", error);
        throw error;
    }
}

/**
 * Step 2: Get Conversation Entry
 * Uses the access token to fetch the latest conversation entry.
 */
async function getConversationEntry(accessToken, conversationIdentifier) {
    const baseUrl = process.env.SALESFORCE_BASE_URL;
    if (!baseUrl) {
        throw new Error("Missing required environment variable: SALESFORCE_BASE_URL");
    }

    const apiUrl = `${baseUrl}/services/data/v65.0/connect/conversation/${conversationIdentifier}/entries?recordLimit=1`;

    console.log(`Fetching data from: ${apiUrl}`);

    try {
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Failed to get conversation entry: ${response.status} ${response.statusText} - ${errorBody}`);
        }

        const data = await response.json();
        return data;

    } catch (error) {
        console.error("Error in getConversationEntry:", error);
        throw error;
    }
}

/**
 * Step 3: Send POST Request (if role is 'Agent')
 * Sends an HTTP POST with Basic Auth.
 */
async function sendPostRequest(destination, content) {
    const apiUrl = process.env.Modica_POST_API_URL;
    const apiUser = process.env.Modica_POST_API_USER;
    const apiPass = process.env.Modica_POST_API_PASS;

    if (!apiUrl || !apiUser || !apiPass) {
        throw new Error("Missing required environment variables for POST request: Modica_POST_API_URL, Modica_POST_API_USER, or Modica_POST_API_PASS");
    }

    // Create Basic Auth header
    const authHeader = 'Basic ' + Buffer.from(`${apiUser}:${apiPass}`).toString('base64');

    const payload = {
        destination,
        content,
    };

    console.log(`Sending POST request to ${apiUrl} for destination ${destination}`);
    
    /*
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Failed to send POST request: ${response.status} ${response.statusText} - ${errorBody}`);
        }

        console.log("Successfully sent POST request.");
        const responseData = await response.json(); // Assuming POST returns JSON
        return responseData;

    } catch (error) {
        console.error("Error in sendPostRequest:", error);
        throw error; // Re-throw to be caught by the handler
    }
    */

    //Returning dummy result for now
    return {
        status: "accepted",
        detail: destination
    };
}
