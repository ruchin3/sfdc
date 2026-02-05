import { track, api, LightningElement } from "lwc";

export default class PreChatMessagingButtons extends LightningElement {
    
    /**
    * Deployment configuration data.
    * @type {Object}
    */
    @api configuration = {};

    startConversationLabel;

    isSubmitButtonDisabled = false;
    
    handle1() {
        this.dispatchButtonClickEvent('Question about practice locations');
    }
    
    handle2() {
        this.dispatchButtonClickEvent('More information about a service');
    }
    
    handle3() {
        this.dispatchButtonClickEvent('Question about appointments');
    }
    
    handle4() {
        this.dispatchButtonClickEvent('Account or billing enquiry');
    }

    handle5() {
        this.dispatchButtonClickEvent('Question about results');
    }

    /**
     * Dispatches a custom event with button type information
     * @param {string} buttonType - Type of button clicked
     */
    dispatchButtonClickEvent(buttonType) {
        console.debug('PreChatMessagingButtons: Dispatching ButtonClick event for:', buttonType);
        
        try {            
            this.dispatchEvent(new CustomEvent(
                "prechatsubmit",
                {
                    detail: { value: {"buttonType":buttonType} }
                }
            ));
            console.debug('prechatsubmit event sent');

        } catch (error) {
            console.error('PreChatMessagingButtons: Error dispatching event:', error);
        }
    }
}
