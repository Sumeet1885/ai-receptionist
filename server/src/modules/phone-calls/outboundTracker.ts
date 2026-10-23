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
    const idx = outboundRecords.findIndex(r => r.runName === params.runName);
    if (idx !== -1) {
      const match = outboundRecords[idx];
      outboundRecords.splice(idx, 1);
      return match;
    }
  }

  const matchingIndices: number[] = [];
  outboundRecords.forEach((r, idx) => {
    if (params.botId && r.botId !== params.botId) return;
    if (params.phoneNumber && r.phoneNumber !== params.phoneNumber) return;
    if (Math.abs(r.createdAt - targetTime) < 15 * 60 * 1000) {
      matchingIndices.push(idx);
    }
  });

  if (matchingIndices.length === 0) return undefined;

  matchingIndices.sort((a, b) => {
    return Math.abs(outboundRecords[a].createdAt - targetTime) - Math.abs(outboundRecords[b].createdAt - targetTime);
  });

  const bestIdx = matchingIndices[0];
  const bestRecord = outboundRecords[bestIdx];
  // CONSUME the record so subsequent calls cannot match the exact same contact
  outboundRecords.splice(bestIdx, 1);
  return bestRecord;
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
