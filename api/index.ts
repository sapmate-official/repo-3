import type { IncomingMessage, ServerResponse } from 'http';

let appInstance: any = null;
let initError: Error | null = null;

async function getApp() {
  if (appInstance) return appInstance;
  if (initError) throw initError;
  try {
    const { createApp } = await import('../src/app.js');
    appInstance = createApp();
    return appInstance;
  } catch (err: unknown) {
    initError = err instanceof Error ? err : new Error(String(err));
    throw initError;
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Serverless function initialization error:', message);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify(
        {
          error: 'FUNCTION_INIT_FAILED',
          message,
          hint: 'Ensure all required environment variables (e.g. DATABASE_URL, USER_ACCESS_TOKEN_SECRET) are defined in Vercel Project Settings > Environment Variables.'
        },
        null,
        2
      )
    );
  }
}
