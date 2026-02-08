import { track, api, LightningElement } from "lwc";

export default class HalterChatButtons extends LightningElement {
    
    /**
    * Deployment configuration data.
    * @type {Object}
    */
    @api configuration = {};

    startConversationLabel;

    isSubmitButtonDisabled = false;
    
    handle1() {
        this.dispatchButtonClickEvent('Require urgent help');
    }
    
    handle2() {
        this.dispatchButtonClickEvent('Launch team');
    }
    
    handle3() {
        this.dispatchButtonClickEvent('Map edit');
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
