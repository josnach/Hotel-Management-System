/** Turns the form's opt-in checkbox into the three consent columns (so we always know when consent was given or withdrawn). */
export function consentData<T extends { whatsappOptIn?: boolean }>(b: T): Omit<T, 'whatsappOptIn'> & { whatsappOptIn?: boolean; whatsappOptInAt?: Date; whatsappOptOutAt?: Date | null } {
  const { whatsappOptIn, ...rest } = b;
  if (whatsappOptIn === undefined) return rest;
  return whatsappOptIn
    ? { ...rest, whatsappOptIn: true, whatsappOptInAt: new Date(), whatsappOptOutAt: null }
    : { ...rest, whatsappOptIn: false, whatsappOptOutAt: new Date() };
}
