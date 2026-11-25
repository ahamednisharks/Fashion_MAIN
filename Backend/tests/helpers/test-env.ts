// Must be the FIRST import of every test file: env.ts reads NODE_ENV when it loads, and in
// test mode the API connects to "<DB_NAME>_test" instead of the development database.
process.env['NODE_ENV'] = 'test';
