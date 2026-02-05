import { api, LightningElement } from "lwc";

const MESSAGE_CONTENT_CLASS = "embedded-messaging-message-content";
const ENDUSER = "EndUser";
const AGENT = "Agent";
const CHATBOT = "Chatbot";
const PARTICIPANT_TYPES = [ENDUSER, AGENT, CHATBOT];

export default class WelcomeButtons extends LightningElement {
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
        return this.conversationEntry.sender && this.conversationEntry.sender.role;
    }

    /**
     * Returns the text content of the conversation entry.
     * @returns {string}
     */
    get textContent() {
        // This component doesn't parse incoming messages, but we keep this getter
        // to match the structure of the sample component.
        return "";
    }

    /**
     * Returns the class name of the message bubble.
     * @returns {string}
     */
    get generateMessageBubbleClassname() {
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
        this.insertText(this.messages.hello);
    }
    handleNeedHelp() {
        this.insertText(this.messages.needHelp);
    }
    handleTalkToAgent() {
        this.insertText(this.messages.talkToAgent);
    }
    handleThanks() {
        this.insertText(this.messages.thanks);
    }

    insertText(text) {
        const results = [];

        // 0) Preferred: call Embedded Messaging utilAPI to send the message immediately
        try {
            if (window.embeddedservice_bootstrap && window.embeddedservice_bootstrap.utilAPI && typeof window.embeddedservice_bootstrap.utilAPI.sendTextMessage === 'function') {
                window.embeddedservice_bootstrap.utilAPI.sendTextMessage(text);
                results.push('utilAPI.sendTextMessage');
            }
        } catch (e) {
            // ignore and fall back
        }

        // 1) Fire a DOM CustomEvent for hosts within Lightning runtime (optional integration point)
        try {
            this.dispatchEvent(new CustomEvent('inserttext', { detail: text, bubbles: true, composed: true }));
            results.push('customEvent');
        } catch (e) {
            // no-op
        }

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
                    } catch {
                        /* ignore per attempt */
                    }
                });
            }
        } catch {
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
                } catch {
                    /* ignore */
                }
            });
        } catch {
            /* ignore */
        }

        // Status feedback for admin/implementation visibility
        // We use a simple approach to display the message text that was sent
        this._textContent = results.length
            ? `Sent: ${text}`
            : 'No messaging targets detected. Ensure this component runs on a page with Embedded Messaging (embeddedservice_bootstrap).';
    }

    /**
     * Returns the text content of the conversation entry.
     * @returns {string}
     */
    get textContentDisplay() {
        return this._textContent || '';
    }
}
