# PreChatMessagingButtons Component

A Lightning Web Component that displays 4 quick-reply buttons for Embedded Messaging Pre-Chat forms.

## Description

This component displays 4 buttons with common quick-reply messages that can be used in Embedded Messaging pre-chat forms. When a user clicks any button, it dispatches a custom event with information about which button was clicked, and also logs all available pre-chat form fields to the console.

## Buttons

1. **Hello** - Sends "Hello! 👋"
2. **Need Help** - Sends "I need help with my issue."
3. **Talk to Agent** - Sends "Please connect me to a live agent."
4. **Thanks** - Sends "Thanks!"

## How to Use

### 1. Using the Component

Add this component to your Embedded Messaging Pre-Chat form:

```html
<c-pre-chat-messaging-buttons></c-pre-chat-messaging-buttons>
```

### 2. Listening for Events in Parent Page

The component dispatches a custom event named `ButtonClick` when any button is clicked. The event includes information about which button was clicked in the event detail:

#### JavaScript Implementation:
```javascript
handleButtonClick(event) {
    const buttonType = event.detail.buttonType;
    console.log('Button clicked:', buttonType);
    
    // Handle different button types
    switch(buttonType) {
        case 'hello':
            // Handle hello button
            break;
        case 'needHelp':
            // Handle need help button
            break;
        case 'talkToAgent':
            // Handle talk to agent button
            break;
        case 'thanks':
            // Handle thanks button
            break;
    }
}
```

#### HTML Implementation:
```html
<!-- Listen for the ButtonClick event from the child component -->
<c-pre-chat-messaging-buttons onButtonClick={handleButtonClick}></c-pre-chat-messaging-buttons>
```

## Pre-Chat Field Logging

The component automatically logs all available pre-chat form fields to the browser console when it loads. This includes:

- Field names
- Field labels  
- Field types
- Display order
- Required status

## Event Details

The custom event `ButtonClick` contains the following detail:

```javascript
{
    buttonType: "hello" | "needHelp" | "talkToAgent" | "thanks"
}
```

## Target Configuration

This component is configured to target `lightningSnapin__MessagingPreChat` for use in Embedded Messaging Pre-Chat Forms.

## Configuration Access

The component has access to the `configuration` API property which contains all pre-chat form configuration data. This allows the component to:

- Access pre-chat form fields
- Determine field properties (required, type, etc.)
- Log field information for debugging purposes
