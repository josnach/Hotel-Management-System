export interface OutboundMessage { to: string; template: string; lang: string; params: string[] }

export class SendError extends Error {
  constructor(message: string, public retryable: boolean, public code?: number) { super(message); }
}

/** Swap Meta for another provider (Twilio, 360dialog…) by implementing this one method. */
export interface MessagingProvider {
  send(m: OutboundMessage): Promise<{ providerMsgId: string }>;
}
