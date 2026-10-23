export interface OutboundCallRecord {
  runName?: string;
  botId: string;
  phoneNumber: string;
  contactName?: string;
  sessionId: string;
  createdAt: number;
}

const outboundRecords: OutboundCallRecord[] = [];

export function registerOutboundCall(data: {
  runName?: string;
  botId: string;
  phoneNumber: string;
  contactName?: string;
  sessionId: string;
}): void {
  const record: OutboundCallRecord = {
    ...data,
    createdAt: Date.now()
  };
  outboundRecords.push(record);
  if (outboundRecords.length > 500) {
    outboundRecords.splice(0, outboundRecords.length - 500);
  }
}

export function findOutboundCall(params: {
  runName?: string;
  botId?: string;
  phoneNumber?: string;
  callTimeMs?: number;
}): OutboundCallRecord | undefined {
  const targetTime = params.callTimeMs || Date.now();

  if (params.runName) {
    const match = outboundRecords.find(r => r.runName === params.runName);
    if (match) return match;
  }

  const matchingRecords = outboundRecords.filter(r => {
    if (params.botId && r.botId !== params.botId) return false;
    if (params.phoneNumber && r.phoneNumber !== params.phoneNumber) return false;
    return Math.abs(r.createdAt - targetTime) < 15 * 60 * 1000;
  });

  if (matchingRecords.length === 0) return undefined;

  matchingRecords.sort((a, b) => {
    return Math.abs(a.createdAt - targetTime) - Math.abs(b.createdAt - targetTime);
  });

  return matchingRecords[0];
}

export function getLatestOutboundCallForBot(botId: string, maxAgeMs = 120_000): OutboundCallRecord | undefined {
  let latest: OutboundCallRecord | undefined;
  for (const record of outboundRecords) {
    if (record.botId === botId && Date.now() - record.createdAt < maxAgeMs) {
      if (!latest || record.createdAt > latest.createdAt) {
        latest = record;
      }
    }
  }
  return latest;
}
