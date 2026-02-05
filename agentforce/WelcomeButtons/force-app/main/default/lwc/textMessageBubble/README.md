# textMessageBubble

Reusable SMS-style chat bubble Lightning Web Component.

Features:
- Inbound/outbound alignment and theming
- Optional avatar (inbound only)
- Optional timestamp and delivery status
- Optional bubble tail
- Max-width control and CSS variables for easy theming
- Safe autolinking of URLs
- Accessibility-friendly aria-label/title
- Optional multi-line truncation (line clamp)

Public @api properties:
- message: string (required)
- direction: 'inbound' | 'outbound' (default: inbound)
- avatarSrc: string (optional)
- avatarAlt: string (optional)
- timestamp: string | number | Date (optional)
- status: 'sent' | 'delivered' | 'read' | 'failed' (optional)
- showTail: boolean (default false per LWC rule)
- maxWidth: string (default '75%')
- bubbleTitle: string (optional)
- truncate: number (optional, CSS line clamp)

CSS Variables (override in host or parent):
- --bubble-inbound-bg
- --bubble-inbound-color
- --bubble-outbound-bg
- --bubble-outbound-color
- --bubble-radius
- --bubble-padding
- --bubble-shadow

Example usage:
```html
<c-text-message-bubble
  message="Hi! Check https://example.com"
  direction="inbound"
  avatar-src="https://picsum.photos/40"
  avatar-alt="Ava"
  timestamp="2025-10-22T10:15:00Z"
  status="delivered"
  show-tail
  max-width="70%"
  truncate="4"
></c-text-message-bubble>

<c-text-message-bubble
  message="Thanks! Will do."
  direction="outbound"
  status="read"
  show-tail
  max-width="60%"
></c-text-message-bubble>
```

Deployment:
- Use Salesforce CLI: `sf project deploy start -m LightningComponentBundle:textMessageBubble`
