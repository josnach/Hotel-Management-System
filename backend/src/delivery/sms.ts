import { config, smsConfigured } from '../config';

/** Termii "send SMS" API. `to` = digits with country code, no "+". */
export async function sendSms(to: string, text: string) {
  if (!smsConfigured()) throw new Error('SMS is not configured (set TERMII_API_KEY and TERMII_SENDER_ID)');
  let res: Response;
  try {
    res = await fetch(`${config.sms.baseUrl.replace(/\/$/, '')}/api/sms/send`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ to, from: config.sms.senderId, sms: text, type: 'plain', channel: config.sms.channel, api_key: config.sms.apiKey }),
    });
  } catch (e) { throw new Error(`SMS network error: ${(e as Error).message}`); }
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || (data.code && data.code !== 'ok')) throw new Error(String(data.message ?? `SMS provider error ${res.status}`).slice(0, 300));
  return { id: String(data.message_id ?? data.message_id_str ?? '') };
}