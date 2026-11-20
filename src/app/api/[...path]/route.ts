import { proxy } from '../../../lib/api-proxy';

// Transport only: Go still owns auth, CSRF, validation and business routes.
// Route Handlers use Web streams without Middleware's automatic body clone.
// https://nextjs.org/docs/app/api-reference/file-conventions/route#streaming
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
