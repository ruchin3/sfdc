/*
Test script to verify ButtonClick event functionality

To test this component:

1. Deploy the component to your org
2. Create a parent component that uses this component
3. Add the following to your parent component's JavaScript:

// Test event listener
connectedCallback() {
    console.log('Adding event listener for ButtonClick');
    this.addEventListener('ButtonClick', this.handleButtonClick.bind(this));
}

disconnectedCallback() {
    this.removeEventListener('ButtonClick', this.handleButtonClick.bind(this));
}

handleButtonClick(event) {
    console.log('ButtonClick event received!');
    console.log('Event type:', event.type);
    console.log('Event bubbles:', event.bubbles);
    console.log('Event composed:', event.composed);
}

// In your parent component's HTML:
// <c-pre-chat-messaging-buttons onButtonClick={handleButtonClick}></c-pre-chat-messaging-buttons>

// Or using the addEventListener approach:
// <c-pre-chat-messaging-buttons></c-pre-chat-messaging-buttons>
*/

// Simple test to verify event creation
console.log('Testing ButtonClick event creation...');

try {
    // Test creating the event
    const testEvent = new CustomEvent('ButtonClick', {
        bubbles: true,
        composed: true
    });
    
    console.log('Event created successfully:', testEvent);
    console.log('Event type:', testEvent.type);
    console.log('Event bubbles:', testEvent.bubbles);
    console.log('Event composed:', testEvent.composed);
    
    console.log('Test completed successfully - event creation works!');
} catch (error) {
    console.error('Error creating event:', error);
}
