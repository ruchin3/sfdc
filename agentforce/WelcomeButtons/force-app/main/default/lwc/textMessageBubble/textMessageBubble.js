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
                   { label: 'Locations', value: 'Question about practice locations' },
                   { label: 'Appointments', value: 'Question about appointments' },
                   { label: 'Accounts', value: 'Account or billing enquiry' },
                   { label: 'Results', value: 'Question about results' }
                 ];
                 this.ctaGroups = [{ id: 'group-menu', buttons, isFirst: true }];
                 this.showCtas = true;
               }
             } else if (parsed.type === 'locations' && Array.isArray(parsed.locations)) {
               if (initializingFromPayload) {
                 // A button for each item where label is the item value
                 // and value is: "Show me details for location <item>"
                 const buttons = parsed.locations
                   .filter((l) => l != null && String(l).trim().length > 0)
                   .map((item) => {
                     const label = String(item).trim();
                     return {
                       label,
                       value: `Information for location ${label}`
                     };
                   });
                 this.ctaGroups = buttons.length > 0 ? [{ id: 'group-locations', buttons }] : [];
                 this.showCtas = buttons.length > 0;
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

         // Support Markdown-style bold (**text**) and links ([text](url)) — convert to HTML tags.
         // lightning-formatted-rich-text will render the resulting HTML safely.
         if (typeof text === 'string') {
           // Convert bold: **text** -> <strong>text</strong>
           text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
           
           // Replace exclamation marks with periods
           text = text.replace(/!/g, '.');
           
           // Convert links: [text](url) -> <a href="url" target="_blank">text</a>
           // This regex handles basic cases but doesn't validate URLs strictly
           text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
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

     // If the "Locations" top-level CTA is clicked, append submenu as a new group
     if ((label && label.toLowerCase() === 'locations') || (value && value.toLowerCase().includes('locations'))) {
       // Prevent any upstream handler from resetting state on the same tick
       event.stopPropagation();
       event.preventDefault();

       // Build submenu as a separate group and append without removing existing groups
       const submenuButtons = [
         { label: 'Eastern Suburbs', value: 'PRP Practices in Eastern Suburbs region' },
         { label: 'North Shore', value: 'PRP Practices in North Shore / Northern Sydney region' },
         { label: 'Regional NSW', value: 'PRP Practices in Regional NSW region' },
         { label: 'Western Sydney', value: 'PRP Practices in Western Sydney region' },
         { label: 'Northern Beaches', value: 'PRP Practices in Northern Beaches region' },
         { label: 'Illawarra', value: 'PRP Practices in Illawarra region' },
         { label: 'North West Sydney', value: 'PRP Practices in North West Sydney region' },
         { label: 'Central Coast', value: 'PRP Practices in Central Coast region' },
         { label: 'Hunter Region', value: 'PRP Practices in Newcastle / Hunter region' }
       ];

       // Fixed text that should appear before the second set of buttons (from JS)
       const submenuPreface = 'Please select one of the regions below:';

       // Initialize if needed
       if (!Array.isArray(this.ctaGroups)) {
         this.ctaGroups = [];
       }

       // Avoid duplicating the submenu if user clicks "Locations" multiple times
       const hasLocations = this.ctaGroups.some(g => g.id === 'group-locations-submenu');
       if (!hasLocations) {
         this.ctaGroups = [
           ...this.ctaGroups,
           { id: 'group-locations-submenu', buttons: submenuButtons, prefaceText: submenuPreface }
         ];
       }
       this.showCtas = this.ctaGroups.length > 0;
       return;
     }

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
