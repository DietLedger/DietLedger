import { proxy } from './src/proxy';

export const config = {
  matcher: '/api/:path*',
};

export default proxy;
