// Angular dev-server proxy: the browser calls /api/... on the same origin (no CORS) and the
// dev server forwards those requests to the backend.
// Default target: http://localhost:3000 — override with the API_PROXY_TARGET environment variable.
export default {
  '/api': {
    target: process.env['API_PROXY_TARGET'] ?? 'http://localhost:3000',
    secure: false,
    logLevel: 'warn',
  },
};
