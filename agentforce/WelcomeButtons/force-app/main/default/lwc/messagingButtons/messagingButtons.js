import { api, LightningElement } from "lwc";

const MESSAGE_CONTENT_CLASS = "embedded-messaging-message-content";
const ENDUSER = "EndUser";
const AGENT = "Agent";
const CHATBOT = "Chatbot";
const PARTICIPANT_TYPES = [ENDUSER, AGENT, CHATBOT];

export default class MessagingButtons extends LightningElement {
    constructor() {
        super();
//        console.debug('MessagingButtons: Component initialized');
    }

    /**
     * Deployment configuration data.
     * @type {Object}
     */
    @api configuration;

    /**
     * Conversation entry data.
     * @type {Object}
     */
    @api conversationEntry;

    /**
     * Returns the sender of this conversation entry.
     * @returns {string}
     */
    get sender() {
        console.debug('MessagingButtons: Getting sender', this.conversationEntry?.sender?.role);
        return this.conversationEntry.sender && this.conversationEntry.sender.role;
    }

    /**
     * Returns the text content of the conversation entry.
     * @returns {string}
     */
    get textContent() {
        // This component doesn't parse incoming messages, but we keep this getter
        // to match the structure of the sample component.
        console.debug('MessagingButtons: Getting text content');
        return "";
    }

    /**
     * Returns the class name of the message bubble.
     * @returns {string}
     */
    get generateMessageBubbleClassname() {
        console.debug('MessagingButtons: Generating message bubble classname');
        if (this.isSupportedSender()) {
            return `${MESSAGE_CONTENT_CLASS} ${this.sender}`;
        } else {
            throw new Error(`Unsupported participant type passed in: ${this.sender}`);
        }
    }

    /**
     * True if the sender is a support participant type.
     * @returns {Boolean}
     */
    isSupportedSender() {
        console.debug('MessagingButtons: Checking supported sender', this.sender);
        return PARTICIPANT_TYPES.some(
            (participantType) => this.sender === participantType,
        );
    }

    // Public labels for potential future configurability
    messages = {
        hello: 'Hello! 👋',
        needHelp: 'I need help with my issue.',
        talkToAgent: 'Please connect me to a live agent.',
        thanks: 'Thanks!'
    };

    handleHello() {
        console.debug('MessagingButtons: Hello button clicked');
        this.dispatchCustomEvent('buttonClick');
        this.insertText(this.messages.hello);
    }
    handleNeedHelp() {
        console.debug('MessagingButtons: Need Help button clicked');
        this.dispatchCustomEvent('buttonClick');
        this.insertText(this.messages.needHelp);
    }
    handleTalkToAgent() {
        console.debug('MessagingButtons: Talk to Agent button clicked');
        this.dispatchCustomEvent('buttonClick');
        this.insertText(this.messages.talkToAgent);
    }
    handleThanks() {
        console.debug('MessagingButtons: Thanks button clicked');
        this.dispatchCustomEvent('buttonClick');
        this.insertText(this.messages.thanks);
    }

    // Dispatch custom event that can be listened to by the embedding page
    dispatchCustomEvent(eventName) {
        console.debug(`MessagingButtons: Dispatching custom event "${eventName}"`);
        try {
            this.dispatchEvent(new CustomEvent(eventName, {
                bubbles: true,
                composed: true
            }));
            console.debug(`MessagingButtons: Successfully dispatched custom event "${eventName}"`);
        } catch (error) {
            console.debug(`MessagingButtons: Error dispatching custom event "${eventName}":`, error);
        }
    }

    insertText(text) {
        console.debug('MessagingButtons: Inserting text:', text);
        const results = [];

        try {
            this.dispatchEvent(new CustomEvent('inserttext', { detail: text, bubbles: true, composed: true }));
            results.push('customEvent');
            console.debug('CustomEvent successful');
        } catch (e) {
            console.debug('MessagingButtons: Error dispatching custom event', e);
            // no-op
        }

        // 0) Preferred: call Embedded Messaging utilAPI to send the message immediately
        try {
            console.debug('Trying to use utilAPI');
            if (window.embeddedservice_bootstrap && window.embeddedservice_bootstrap.utilAPI && typeof window.embeddedservice_bootstrap.utilAPI.sendTextMessage === 'function') {
                window.embeddedservice_bootstrap.utilAPI.sendTextMessage(text);
                results.push('utilAPI.sendTextMessage');
                console.debug('SendTextMessage successful');
            }
            else console.log('utilAPI not available');
        } catch (e) {
            console.debug('MessagingButtons: Error using utilAPI', e);
            // ignore and fall back
        }

        // 1) Fire a DOM CustomEvent for hosts within Lightning runtime (optional integration point)
        // 2) Fallback: Try posting to parent window for Embedded Messaging for Web (various API shapes to cover versions)
        try {
            if (window && window.parent && window.parent !== window) {
                const attempts = [
                    { type: 'embedded_messaging.insert_text', text },
                    { type: 'web_messaging.insert_text', text },
                    { type: 'embedded_svc:sendMessage', message: { text } },
                    { type: 'esw:sendMessage', message: text }
                ];

                attempts.forEach((payload) => {
                    try {
                        window.parent.postMessage(payload, '*');
                        results.push(payload.type);
                    } catch (e) {
                        console.debug('MessagingButtons: Error posting to parent', e);
                        /* ignore per attempt */
                    }
                });
            }
        } catch (e) {
            console.debug('MessagingButtons: Error with parent posting', e);
            /* ignore */
        }

        // 3) Local window postMessage for hosts that listen without parent indirection
        try {
            const localPayloads = [
                { type: 'embedded_messaging.insert_text', text },
                { type: 'web_messaging.insert_text', text }
            ];
            localPayloads.forEach((p) => {
                try {
                    window.postMessage(p, '*');
                    results.push('self:' + p.type);
                } catch (e) {
                    console.debug('MessagingButtons: Error posting locally', e);
                    /* ignore */
                }
            });
        } catch (e) {
            console.debug('MessagingButtons: Error with local posting', e);
            /* ignore */
        }

        // Status feedback for admin/implementation visibility
        // We use a simple approach to display the message text that was sent
        this._textContent = results.length
            ? `Sent: ${text}`
            : 'No messaging targets detected. Ensure this component runs on a page with Embedded Messaging (embeddedservice_bootstrap).';
        console.debug('MessagingButtons: Insertion results:', results);
    }

    /**
     * Returns the text content of the conversation entry.
     * @returns {string}
     */
    get textContentDisplay() {
        console.debug('MessagingButtons: Getting text content display');
        return this._textContent || '';
    }
}
