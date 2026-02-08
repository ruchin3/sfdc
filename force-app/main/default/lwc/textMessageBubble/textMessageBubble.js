import { api, LightningElement } from "lwc";
 const MESSAGE_CONTENT_CLASS = "embedded-messaging-message-content";
 const ENDUSER = "EndUser";
 const AGENT = "Agent";
 const CHATBOT = "Chatbot";
 const PARTICIPANT_TYPES = [ENDUSER, AGENT, CHATBOT];

 export default class CustomTextMessageBubble extends LightningElement {
   /**
    * Controls conditional rendering of CTA buttons groups in the template.
    * When true and ctaGroups has entries, template renders them.
    */
   showCtas = false;

   /**
    * One or more CTA button groups to render as separate bubbles.
    * Each group: { id: string, buttons: Array<{label:string, value:string}>, isFirst?: boolean, prefaceText?: string }
    * - isFirst=true means render within the main text bubble.
    * - prefaceText when present will be rendered (by the template) before that group's buttons.
    */
   ctaGroups = [];

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
     try {
       const entryPayload = JSON.parse(this.conversationEntry.entryPayload);
       // IMPORTANT: Do not reset showCtas/ctaGroups here unconditionally, or we will wipe out click-driven menus.
       // Only initialize from payload if we haven't already set click-driven groups.
       let initializingFromPayload = !this.showCtas && (!this.ctaGroups || this.ctaGroups.length === 0);
       if (initializingFromPayload) {
         this.showCtas = false;
         this.ctaGroups = [];
       }

       if (
         entryPayload.abstractMessage &&
         entryPayload.abstractMessage.staticContent
       ) {
         let text = entryPayload.abstractMessage.staticContent.text;

         // If the payload's text is a JSON string, parse it to extract message/type
         try {
           const parsed = JSON.parse(text);
           if (parsed && typeof parsed === 'object') {
             if (parsed.type === 'menu') {
               // Only set menu if we are initializing from payload (not after a click submenu)
               if (initializingFromPayload) {
                 const buttons = [
                   { label: 'Urgent Help', value: 'Require urgent help' },
                   { label: 'Launch Team', value: 'Launch team' },
                   { label: 'Map Edit', value: 'Map edit' }
                 ];
                 this.ctaGroups = [{ id: 'group-menu', buttons, isFirst: true }];
                 this.showCtas = true;
               }
             } 

             // Prefer parsed.message if present
             if (parsed.message) {
               text = parsed.message;
             }
           }
         } catch (e) {
           // Not JSON; leave as-is
           // eslint-disable-next-line no-console
           console.log('Parsing text: Text is text, not object');
         }

         return text;
       }
       return "";
     } catch (e) {
       console.error(e);
       this.showCtas = false;
       this.buttons = [];
       return "";
     }
   }

   /**
    * Generic click handler to detect which dynamic button was triggered.
    * If "Locations" is clicked, append a new static list as a separate bubble instead of replacing the first.
    */
   handleButtonClick(event) {
     const value = event.currentTarget?.dataset?.value || event.target?.dataset?.value;
     const label = event.currentTarget?.label || event.target?.label;

     // Otherwise continue with normal dispatch of the clicked value/label
     this.dispatchButtonClickEvent(value || label || 'unknown');
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

  dispatchButtonClickEvent(buttonType) {
    console.debug('TextMessageBubble: Dispatching buttonclick for:', buttonType);

    try {
      const dataToSend = {
          eventType: 'ButtonClick',
          buttonType: buttonType
      };

      window.parent.postMessage(dataToSend, '*');
      console.debug('ButtonClick message posted');

    } catch (error) {
        console.error('TextMessageBubble: Error dispatching event:', error);
    }
  }
}
