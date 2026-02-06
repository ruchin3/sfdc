// messagingQuickReplies.js
import { LightningElement } from 'lwc';

export default class MessagingQuickReplies extends LightningElement {

    /**
     * Handles the click event for any of the quick reply buttons.
     * @param {Event} event - The click event.
     */
    handleReplyClick(event) {
        // Retrieve the message text from the button's data attribute
        const messageText = event.target.dataset.message;

        if (messageText) {
            this.sendUserMessage(messageText);
        }
    }

    /**
     * Sends a message to the active messaging session on behalf of the end-user.
     * This relies on the SendMessage API (window.lhsp.sendMessage) being available on the page.
     * @param {string} text - The message to be sent.
     */
    sendUserMessage(text) {
        // Construct the message payload according to the API documentation
        const message = {
            type: 'system',
            text: text,
        };

        // Check if the Messaging API is available on the window object
        if (window.lhsp && typeof window.lhsp.sendMessage === 'function') {
            
            // Call the SendMessage API
            window.lhsp.sendMessage(message)
                .then(() => {
                    console.log('Message sent successfully from LWC.');
                })
                .catch(error => {
                    console.error('Error sending message from LWC:', error);
                });

        } else {
            console.warn('Messaging API (window.lhsp.sendMessage) not found. Ensure this component is used within a Messaging for In-Session Web context.');
        }
    }
}