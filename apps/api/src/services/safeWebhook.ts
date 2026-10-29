import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';

const privateV4 = new BlockList();
for (const [address, prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const) privateV4.addSubnet(address, prefix, 'ipv4');
const globalV6 = new BlockList(); globalV6.addSubnet('2000::', 3, 'ipv6');
const reservedV6 = new BlockList();
for (const [address, prefix] of [['2001::',23],['2001:db8::',32],['2002::',16],['3ffe::',16],['3fff::',20]] as const) reservedV6.addSubnet(address, prefix, 'ipv6');

export function publicWebhookAddress(address: string) {
  const family = isIP(address);
  return family === 4 ? !privateV4.check(address, 'ipv4')
    : family === 6 && globalV6.check(address, 'ipv6') && !reservedV6.check(address, 'ipv6');
}
export function parseWebhookUrl(value: string, production = process.env.DEPLOY_ENV === 'production') {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || (production && url.protocol !== 'https:') || url.username || url.password) throw new Error('Use a public HTTPS webhook URL without embedded credentials.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && !publicWebhookAddress(host)) throw new Error('Webhook must use a public internet address.');
  return url;
}
export async function webhookDestination(url: URL, resolve = lookup) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const answers = isIP(host) ? [{ address: host, family: isIP(host) }] : await resolve(host, { all: true, verbatim: true });
  if (!answers.length || answers.some(answer => !publicWebhookAddress(answer.address))) throw new Error('Webhook must resolve only to public internet addresses.');
  return answers[0];
}

/** Validate every request, pin the checked DNS result, never redirect or expose response bodies. */
export async function sendWebhook(value: string, headers: Record<string, string>, body: string, timeoutMs: number): Promise<{ ok: boolean; status: number }> {
  const url = parseWebhookUrl(value);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: ReturnType<typeof httpRequest> | undefined;
  let expired = false;
  try {
    return await Promise.race([
      (async () => {
        const destination = await webhookDestination(url);
        if (expired) throw new Error('Webhook request timed out.');
        return new Promise<{ ok: boolean; status: number }>((resolve, reject) => {
          const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
          pending = send(url, { method: 'POST', headers, agent: false,
            lookup: ((_host: string, options: any, callback: any) => options?.all
              ? callback(null, [destination]) : callback(null, destination.address, destination.family)) as any,
          }, response => {
            let bytes = 0;
            response.on('data', chunk => {
              bytes += chunk.length;
              if (bytes > 64 * 1024) pending?.destroy(new Error('Webhook response exceeded the size limit.'));
            });
            response.on('error', reject);
            response.on('end', () => resolve({ ok: (response.statusCode || 0) >= 200 && (response.statusCode || 0) < 300, status: response.statusCode || 502 }));
          });
          pending.on('error', reject);
          pending.end(body);
        });
      })(),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { expired = true; pending?.destroy(); reject(new Error('Webhook request timed out.')); }, timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}
