interface SessionAuth {
  getSession(): Promise<{ data: { session: { access_token: string } | null } }>;
  refreshSession(): Promise<{ data: { session: { access_token: string } | null }; error: { status?: number } | null }>;
  signOut(options: { scope: 'local' }): Promise<unknown>;
}

/** A rejected access token gets one refresh/retry; concurrent requests share that refresh. */
export function createSessionRequest(auth: SessionAuth) {
  let refreshing: ReturnType<SessionAuth['refreshSession']> | null = null;
  async function clearRejectedSession(token: string) {
    const { data: { session } } = await auth.getSession();
    if (session?.access_token === token) await auth.signOut({ scope: 'local' });
  }
  return async (request: (token: string) => Promise<Response>): Promise<Response> => {
    const { data: { session } } = await auth.getSession();
    if (!session) throw new Error('Your session has ended. Please sign in again.');
    let response = await request(session.access_token);
    if (response.status !== 401) return response;

    const { data: { session: current } } = await auth.getSession();
    if (!current) throw new Error('Your session has ended. Please sign in again.');
    let token = current.access_token;
    if (token === session.access_token) {
      if (!refreshing) refreshing = auth.refreshSession().finally(() => { refreshing = null; });
      const result = await refreshing;
      if (result.error) {
        if ([400, 401, 403].includes(result.error.status || 0)) {
          await clearRejectedSession(token);
          throw new Error('Your session has ended. Please sign in again.');
        }
        throw new Error('Could not refresh your session right now. Please try again.');
      }
      if (!result.data.session) {
        await clearRejectedSession(token);
        throw new Error('Your session has ended. Please sign in again.');
      }
      token = result.data.session.access_token;
    }
    response = await request(token);
    if (response.status === 401) await clearRejectedSession(token);
    return response;
  };
}
