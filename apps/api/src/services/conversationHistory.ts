type MessageRow = {
  sender: 'user' | 'bot';
  content: string;
  created_at: string;
};

export async function fetchRecentMessageHistory(db: any, sessionId: string) {
  const { data, error } = await db
    .from('messages')
    .select('sender, content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    throw error;
  }

  return ((data ?? []) as MessageRow[])
    .slice()
    .reverse()
    .map(message => ({
      id: message.created_at,
      sender: message.sender,
      text: message.content,
      timestamp: message.created_at,
    }));
}
