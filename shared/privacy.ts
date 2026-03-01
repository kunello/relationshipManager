import type { Contact, Interaction } from './types.js';

export function isContactPrivate(contact: Contact): boolean {
  return contact.private === true;
}

export function isInteractionPrivate(interaction: Interaction, contacts: Contact[]): boolean {
  if (interaction.private === true) return true;
  return interaction.contactIds.some(id => {
    const c = contacts.find(ct => ct.id === id);
    return c && isContactPrivate(c);
  });
}
