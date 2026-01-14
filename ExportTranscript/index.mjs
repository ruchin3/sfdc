import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";
import https from "https";
import { URLSearchParams } from "url";

const s3 = new S3Client({});

const CONFIG = {
    SF_CONSUMER_KEY: process.env.SF_CONSUMER_KEY,
    SF_CONSUMER_SECRET: process.env.SF_CONSUMER_SECRET,
    SF_ENDPOINT: process.env.SF_ENDPOINT,
    SF_PRIVATE_KEY: process.env.SF_PRIVATE_KEY,
    SF_USERNAME: process.env.SF_USERNAME, // Still needed for JWT bearer flow
    S3_BUCKET: process.env.S3_BUCKET,
    AWS_ACCOUNT_ID: process.env.AWS_ACCOUNT_ID || "123456789012",
    INSTANCE_ID: process.env.INSTANCE_ID || "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    SF_API_VERSION: "60.0" 
};

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
    console.log('Generating JWT token...');
    
    // Handle private key - replace escaped newlines with actual newlines
    let privateKeyPem = CONFIG.SF_PRIVATE_KEY.replace(/\\n/g, '\n');
    
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
        iss: CONFIG.SF_CONSUMER_KEY,
        sub: CONFIG.SF_USERNAME,
        aud: CONFIG.SF_ENDPOINT,
        exp: Math.floor(Date.now() / 1000) + 300 // 5 minutes expiration
    };
    
    console.log('JWT claims:', {
        iss: `${payload.iss.substring(0, 8)}***`,
        sub: `${payload.sub.substring(0, 3)}***`,
        aud: payload.aud,
        exp: new Date(payload.exp * 1000).toISOString()
    });

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
        
        console.log('✓ JWT token created and signed');
        
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
    const authUrl = new URL(`${CONFIG.SF_ENDPOINT}/services/oauth2/token`);
    
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
                    console.log('✓ Access token obtained');
                    console.log('Instance URL:', tokenData.instance_url);
                    resolve({
                        accessToken: tokenData.access_token,
                        instanceUrl: tokenData.instance_url || CONFIG.SF_ENDPOINT
                    });
                } else {
                    console.error('Token exchange failed:', res.statusCode, data);
                    reject(new Error(`Authentication failed: ${res.statusCode} - ${data}`));
                }
            });
        });

        req.on('error', (error) => {
            console.error('HTTPS request error:', error);
            reject(error);
        });

        req.write(postData);
        req.end();
    });
}

/**
 * Authenticates to Salesforce using JWT bearer token flow
 */
async function authenticateWithJWT() {
    console.log('Exchanging JWT for access token...');
    const { accessToken, instanceUrl } = await getSalesforceAccessToken();
    
    return { accessToken, instanceUrl };
}

/**
 * Execute SOQL query against Salesforce using native HTTPS
 */
async function executeSoqlQuery(accessToken, instanceUrl, query) {
    const encodedQuery = encodeURIComponent(query);
    const queryUrl = new URL(`${instanceUrl}/services/data/v${CONFIG.SF_API_VERSION}/query?q=${encodedQuery}`);

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
                    console.error('SOQL query failed:', res.statusCode, data);
                    reject(new Error(`SOQL query failed: ${res.statusCode} - ${data}`));
                }
            });
        });

        req.on('error', (error) => {
            console.error('HTTPS request error:', error);
            reject(error);
        });

        req.end();
    });
}

/**
 * Call Salesforce REST API using native HTTPS
 */
async function callSalesforceApi(accessToken, instanceUrl, method, endpoint) {
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
                    console.error('API call failed:', res.statusCode, data);
                    reject(new Error(`API call failed: ${res.statusCode} - ${data}`));
                }
            });
        });

        req.on('error', (error) => {
            console.error('HTTPS request error:', error);
            reject(error);
        });

        req.end();
    });
}

export const handler = async (event) => {
    console.log('ExportTranscript Lambda Started');
    console.log('Event received:', JSON.stringify(event, null, 2));
    
    // Validate configuration (redact sensitive values)
    console.log('Configuration check:', {
        SF_ENDPOINT: CONFIG.SF_ENDPOINT,
        SF_USERNAME: CONFIG.SF_USERNAME ? `${CONFIG.SF_USERNAME.substring(0, 3)}***` : 'NOT_SET',
        SF_CONSUMER_KEY: CONFIG.SF_CONSUMER_KEY ? `${CONFIG.SF_CONSUMER_KEY.substring(0, 8)}***` : 'NOT_SET',
        SF_CONSUMER_SECRET: CONFIG.SF_CONSUMER_SECRET ? '***SET***' : 'NOT_SET',
        SF_PRIVATE_KEY: CONFIG.SF_PRIVATE_KEY ? '***SET***' : 'NOT_SET',
        S3_BUCKET: CONFIG.S3_BUCKET,
        AWS_ACCOUNT_ID: CONFIG.AWS_ACCOUNT_ID,
        INSTANCE_ID: CONFIG.INSTANCE_ID,
        SF_API_VERSION: CONFIG.SF_API_VERSION
    });

    const messagingSessionId = event.messagingSessionId;
    if (!messagingSessionId) {
        console.error('ERROR: Missing messagingSessionId in event');
        throw new Error("Missing messagingSessionId");
    }

    console.log(`Processing Session: ${messagingSessionId}`);

    try {
        // 1. Connect to Salesforce using JWT bearer token
        console.log('[STEP 1/5] Connecting to Salesforce with JWT bearer token...');
        console.log(`Endpoint: ${CONFIG.SF_ENDPOINT}, API Version: ${CONFIG.SF_API_VERSION}`);
        
        const loginStartTime = Date.now();
        const { accessToken, instanceUrl } = await authenticateWithJWT();
        console.log(`Salesforce authentication successful (took ${Date.now() - loginStartTime}ms)`);
        console.log(`Instance URL: ${instanceUrl}`);

        // 2. Fetch Session Metadata (Header)
        console.log('[STEP 2/5] Fetching session metadata...');
        const sessionQuery = `
            SELECT Id, ConversationId, Conversation.ConversationIdentifier, StartTime, EndTime 
            FROM MessagingSession 
            WHERE Id = '${messagingSessionId}'
        `;
        console.log('Query:', sessionQuery.trim());
        
        const queryStartTime = Date.now();
        const sessionRes = await executeSoqlQuery(accessToken, instanceUrl, sessionQuery);
        console.log(`Query executed (took ${Date.now() - queryStartTime}ms)`);
        console.log(`Records found: ${sessionRes.records.length}`);
        
        if (sessionRes.records.length === 0) {
            console.error(`ERROR: Session not found: ${messagingSessionId}`);
            throw new Error("Session not found");
        }
        
        const sessionData = sessionRes.records[0];
        const conversationIdentifier = sessionData.Conversation?.ConversationIdentifier;
        
        if (!conversationIdentifier) {
            console.error(`ERROR: No ConversationIdentifier found for session: ${messagingSessionId}`);
            throw new Error("ConversationIdentifier not found");
        }
        
        console.log('Session details:', {
            Id: sessionData.Id,
            ConversationId: sessionData.ConversationId,
            ConversationIdentifier: conversationIdentifier,
            StartTime: sessionData.StartTime,
            EndTime: sessionData.EndTime
        });

        // 3. Fetch Full History via Connect REST API (with Pagination)
        // We use the Connect API because "Enhanced" conversations do not store 
        // message bodies in the standard SOQL tables.
        console.log('[STEP 3/5] Fetching full transcript via Connect API...');
        console.log(`Using ConversationIdentifier: ${conversationIdentifier}`);
        const transcriptStartTime = Date.now();
        const fullTranscript = await fetchFullTranscript(accessToken, instanceUrl, conversationIdentifier);
        console.log(`Transcript fetched (took ${Date.now() - transcriptStartTime}ms)`);
        console.log(`Total entries retrieved: ${fullTranscript.length}`);

        // 4. Transform to Amazon Connect Schema
        console.log('[STEP 4/5] Transforming to Amazon Connect schema...');
        const transformStartTime = Date.now();
        const transcriptJson = generateConnectTranscript(sessionData, fullTranscript);
        console.log(`Transformation complete (took ${Date.now() - transformStartTime}ms)`);
        console.log(`Transcript events generated: ${transcriptJson.Transcript.length}`);
        console.log(`Participants: ${transcriptJson.Participants.length}`);

        // 5. Upload to S3 (will overwrite if object already exists)
        console.log('[STEP 5/5] Uploading to S3...');
        const datePrefix = new Date(sessionData.StartTime).toISOString().split('T')[0].replace(/-/g, '/');
        const key = `custom/ChatTranscripts/${datePrefix}/${messagingSessionId}_transcript.json`;
        
        console.log(`Target bucket: ${CONFIG.S3_BUCKET}`);
        console.log(`Target key: ${key}`);
        console.log(`Note: If this object already exists, it will be overwritten`);
        
        const uploadStartTime = Date.now();
        const transcriptBody = JSON.stringify(transcriptJson, null, 2);
        const transcriptSize = transcriptBody.length;
        console.log(`Payload size: ${(transcriptSize / 1024).toFixed(2)} KB`);
        
        // PutObjectCommand will overwrite existing objects by default
        await s3.send(new PutObjectCommand({
            Bucket: CONFIG.S3_BUCKET,
            Key: key,
            Body: transcriptBody,
            ContentType: "application/json"
        }));
        
        console.log(`S3 upload successful (took ${Date.now() - uploadStartTime}ms)`);
        console.log(`S3 URI: s3://${CONFIG.S3_BUCKET}/${key}`);
        console.log(`ExportTranscript Lambda Completed Successfully`);

        return {
            statusCode: 200,
            body: `Successfully exported ${messagingSessionId}`
        };

    } catch (error) {
        console.error('ERROR in ExportTranscript Lambda');
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        console.error('Session ID:', messagingSessionId);
        throw error;
    }
};

/**
 * Iteratively fetches all pages of the conversation history using native HTTPS.
 */
async function fetchFullTranscript(accessToken, instanceUrl, conversationId) {
    let allEntries = [];
    let pageCount = 0;
    
    // Initial Endpoint - Connect API needs the full /services/data/vXX.0 prefix
    let nextUrl = `/services/data/v${CONFIG.SF_API_VERSION}/connect/conversation/${conversationId}/entries?pageSize=50`;

    while (nextUrl) {
        pageCount++;
        console.log(`  Fetching page ${pageCount}: ${nextUrl}`);
        
        try {
            const pageStartTime = Date.now();
            
            // Use native HTTPS to hit the Connect API endpoint
            const response = await callSalesforceApi(accessToken, instanceUrl, 'GET', nextUrl);
            
            console.log(`Page ${pageCount} fetched (took ${Date.now() - pageStartTime}ms)`);

            if (response.conversationEntries) {
                console.log(`Entries in page ${pageCount}: ${response.conversationEntries.length}`);
                allEntries.push(...response.conversationEntries);
            } else {
                console.warn(`  Warning: No conversationEntries in page ${pageCount} response`);
            }

            // Check if there is a next page
            // The API returns 'nextPageUrl' as a full path or relative path
            nextUrl = response.nextPageUrl || null;
            if (nextUrl) {
                console.log(`Next page URL found: ${nextUrl}`);
            } else {
                console.log(`No more pages (completed after ${pageCount} pages)`);
            }
            
        } catch (error) {
            console.error(`ERROR fetching page ${pageCount}:`, error.message);
            throw error;
        }
    }

    console.log(`Total entries collected: ${allEntries.length}`);
    console.log('Sorting entries by time...');
    
    // Sort by time (Oldest First) ensures linear replay in analytics tools
    // Handle both entryTime and serverReceivedTimestamp fields
    allEntries.sort((a, b) => {
        const timeA = a.entryTime ? new Date(a.entryTime) : new Date(a.serverReceivedTimestamp);
        const timeB = b.entryTime ? new Date(b.entryTime) : new Date(b.serverReceivedTimestamp);
        return timeA - timeB;
    });
    
    console.log('Entries sorted');
    return allEntries;
}

function generateConnectTranscript(session, entries) {
    const customerId = crypto.randomUUID();
    const agentId = crypto.randomUUID();
    
    console.log('Generated participant IDs:', { customerId, agentId });

    const getParticipantId = (role) => (role === 'CUSTOMER' ? customerId : agentId);

    // Helper to extract text from conversation entries
    const extractText = (entry) => {
        // 1. Try messageText field (primary field in Connect API)
        if (entry.messageText) return entry.messageText;
        
        // 2. Try standard Message format
        if (entry.message?.text) return entry.message.text;
        
        // 3. Try Enhanced Payload (MIAW)
        if (entry.entryPayload) {
             // Sometimes strictly nested in abstractMessage
            if (entry.entryPayload.abstractMessage?.staticContent?.text) {
                return entry.entryPayload.abstractMessage.staticContent.text;
            }
            // Or directly in payload for some types
            if (entry.entryPayload.text) return entry.entryPayload.text;
        }
        return null;
    };

    const transcriptEvents = [];
    const startTime = new Date(session.StartTime).toISOString();
    
    console.log('Creating synthetic JOINED events...');

    // A. Synthetic "JOINED" Events
    transcriptEvents.push({
        AbsoluteTime: startTime,
        ContentType: "application/vnd.amazonaws.connect.event.participant.joined",
        Id: crypto.randomUUID(),
        Type: "EVENT",
        ParticipantId: customerId,
        DisplayName: "Customer",
        ParticipantRole: "CUSTOMER"
    });

    transcriptEvents.push({
        AbsoluteTime: startTime,
        ContentType: "application/vnd.amazonaws.connect.event.participant.joined",
        Id: crypto.randomUUID(),
        Type: "EVENT",
        ParticipantId: agentId,
        DisplayName: "Salesforce Agent",
        ParticipantRole: "AGENT"
    });

    // B. Process Messages
    console.log(`Processing ${entries.length} conversation entries...`);
    let skippedEntries = 0;
    let customerMessages = 0;
    let agentMessages = 0;
    
    entries.forEach((entry, index) => {
        // Log every entry for debugging
        console.log(`\n--- Entry ${index + 1}/${entries.length} ---`);
        console.log(`Entry Type: ${entry.entryType || 'unknown'}`);
        const timestamp = entry.entryTime || (entry.serverReceivedTimestamp ? new Date(entry.serverReceivedTimestamp).toISOString() : 'N/A');
        console.log(`Entry Time: ${timestamp}`);
        console.log(`Sender Role: ${entry.sender?.role || 'unknown'}`);
        console.log(`Sender AppType: ${entry.sender?.appType || 'unknown'}`);
        console.log(`Has messageText: ${!!entry.messageText}`);
        console.log(`Has message.text: ${!!entry.message?.text}`);
        console.log(`Has entryPayload: ${!!entry.entryPayload}`);
        
        const textContent = extractText(entry);
        
        if (!textContent) {
            skippedEntries++;
            console.log(`SKIPPED: No text content extracted`);
            console.log(`Raw entry structure: ${JSON.stringify(entry, null, 2)}`);
            return; // Skip status updates/routing events without text
        }
        
        console.log(`Text Content: ${textContent.substring(0, 100)}${textContent.length > 100 ? '...' : ''}`);

        // Determine Role from sender.role field
        // Possible values: 'Agent', 'EndUser', 'System', 'Bot'
        const senderRole = entry.sender?.role || entry.actor?.type || entry.actorType || 'Agent';
        const role = (senderRole === 'EndUser' || senderRole === 'Customer') ? 'CUSTOMER' : 'AGENT';
        
        console.log(`Role: ${role}`);
        console.log(`INCLUDED in transcript`);
        
        if (role === 'CUSTOMER') customerMessages++;
        else agentMessages++;

        // Get timestamp - prefer entryTime, fall back to serverReceivedTimestamp
        const messageTime = entry.entryTime 
            ? new Date(entry.entryTime).toISOString() 
            : new Date(entry.serverReceivedTimestamp).toISOString();

        transcriptEvents.push({
            AbsoluteTime: messageTime,
            Content: textContent,
            ContentType: "text/plain",
            Id: crypto.randomUUID(),
            Type: "MESSAGE",
            ParticipantId: getParticipantId(role),
            DisplayName: role === 'CUSTOMER' ? "Customer" : "Salesforce Agent",
            ParticipantRole: role
        });
    });
    
    console.log(`Message breakdown - Customer: ${customerMessages}, Agent: ${agentMessages}, Skipped: ${skippedEntries}`);

    // C. Synthetic "ENDED" Event
    if (session.EndTime) {
        console.log('Adding ENDED event...');
        transcriptEvents.push({
            AbsoluteTime: new Date(session.EndTime).toISOString(),
            ContentType: "application/vnd.amazonaws.connect.event.chat.ended",
            Id: crypto.randomUUID(),
            Type: "EVENT"
        });
    } else {
        console.log('No EndTime found - skipping ENDED event');
    }

    console.log(`Final transcript contains ${transcriptEvents.length} total events`);

    return {
        Version: "2019-08-26",
        AWSAccountId: CONFIG.AWS_ACCOUNT_ID,
        InstanceId: CONFIG.INSTANCE_ID,
        InitialContactId: session.Id,
        ContactId: session.Id,
        Participants: [
            { ParticipantId: customerId },
            { ParticipantId: agentId }
        ],
        Transcript: transcriptEvents
    };
}