import { config } from '../config';
import { MessagingProvider, OutboundMessage, SendError } from './provider';

/** Meta rejects newlines, tabs and runs of 5+ spaces inside template parameters. */
export const sanitizeParam = (s: string) => (s.replace(/[\n\r\t]+/g, ' ').replace(/ {2,}/g, ' ').trim() || '-').slice(0, 900);

export const metaProvider: MessagingProvider = {
  async send(m: OutboundMessage) {
    const { phoneNumberId, accessToken, apiVersion } = config.whatsapp;
    let res: Response;
    try {
      res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: m.to,
          type: 'template',
          template: {
            name: m.template,
            language: { code: m.lang },
            components: m.params.length ? [{ type: 'body', parameters: m.params.map((t) => ({ type: 'text', text: sanitizeParam(t) })) }] : [],
          },
        }),
      });
    } catch (e) {
      // Network down / timeout: the classic Lagos failure. Always retry.
      throw new SendError(`Network error: ${(e as Error).message}`, true);
    }
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const code = data?.error?.code as number | undefined;
      // 4xx are our fault (bad template/number) except rate limiting; 5xx and 429 are worth retrying.
      throw new SendError(data?.error?.message ?? `WhatsApp error ${res.status}`, res.status >= 500 || res.status === 429 || code === 130429, code);
    }
    const id = data?.messages?.[0]?.id;
    if (!id) throw new SendError('WhatsApp returned no message id', true);
    return { providerMsgId: id as string };
  },
};
