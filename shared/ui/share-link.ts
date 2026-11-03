/**
 * A WhatsApp link that opens WhatsApp with the message filled in and lets the
 * person choose the chat: the app on a phone, WhatsApp Desktop or WhatsApp Web
 * on a laptop. No number is named, so nothing is sent until they pick one.
 */
export function whatsappHref(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
