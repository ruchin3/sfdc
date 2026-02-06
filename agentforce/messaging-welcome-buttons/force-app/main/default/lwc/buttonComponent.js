import { LightningElement, api } from 'lwc';
import { publish, MessageContext } from 'lightning/messageService';
import conversationKitApi from '@salesforce/messageChannel/lightning__conversationKitApi';
import { wire } from 'lwc';

export default class ButtonComponent extends LightningElement {
    @api buttons = [];

    @wire(MessageContext)
    messageContext;

    handleClick(event) {
        const selectedValue = event.target.value;

        const message = {
            type: 'message',
            value: selectedValue,
            content: event.target.label,
        };
        
        publish(this.messageContext, conversationKitApi, message);
    }
}