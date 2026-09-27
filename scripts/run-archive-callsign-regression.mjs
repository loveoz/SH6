import assert from 'node:assert/strict';
import { createArchiveClient } from '../modules/archive/client.js';

const path = 'TTC-SPCWC/2026-09-22/YU_S55OO.log';
const requests = [];
let failSlash = false;
const encoder = new TextEncoder();
globalThis.fetch = async (url) => {
  requests.push(url);
  if (failSlash && url === 'YU/S55OO') throw new Error('Temporary shard failure');
  return { ok: true, arrayBuffer: async () => encoder.encode(url).buffer };
};
globalThis.window = { initSqlJs: async () => ({ Database: class {
  constructor(bytes) { this.call = new TextDecoder().decode(bytes); }
  exec() { return [{ values: ['path', 'contest', 'year', 'mode', 'season'].map((name) => [0, name]) }]; }
  prepare(sql) {
    assert.match(sql, /WHERE callsign = \?/);
    let bound;
    let stepped = false;
    return {
      bind: ([value]) => { bound = value; assert.equal(bound, this.call); },
      step: () => { if (stepped) return false; stepped = true; return ['YU/S55OO', 'YU_S55OO', 'S55OO'].includes(bound); },
      getAsObject: () => ({ path: bound === 'S55OO' ? 'other/S55OO.log' : path, contest: 'TTC-SPCWC', year: 2026, mode: 'CW' }),
      free() {}
    };
  }
} }) };
const makeClient = () => createArchiveClient({
  sqlJsBaseUrls: ['unused/'], normalizeCall: (value) => value.trim().toUpperCase(),
  getArchiveShardUrlsForCallsign: (call) => [call],
  withTimeoutPromise: (promise) => promise,
  normalizeArchiveContestToken: (value) => value,
  normalizeArchiveModeToken: (value) => value
});
const client = makeClient();
assert.deepEqual((await client.queryRowsByCallsign(' yu/s55oo ')).map((row) => row.path), [path]);
assert.deepEqual(requests.sort(), ['YU/S55OO', 'YU_S55OO']);
assert.equal((await client.queryRowsByCallsign('YU_S55OO')).length, 1);
assert.equal(requests.length, 2, 'equivalent searches share cached results');
await client.queryRowsByCallsign('S55OO');
assert.equal(requests.length, 3, 'ordinary calls still request one shard');
assert.equal(client.pickHistoryMatch([{ path, contest: 'TTC-SPCWC', year: 2026, mode: 'CW' }],
  { callsign: 'YU/S55OO', contestId: 'TTC-SPCWC', year: 2026, mode: 'CW' }).path, path);
failSlash = true;
const retryClient = makeClient();
assert.equal((await retryClient.queryRowsByCallsign('YU/S55OO')).length, 1);
failSlash = false;
const beforeRetry = requests.length;
await retryClient.queryRowsByCallsign('YU/S55OO');
assert.ok(requests.length > beforeRetry, 'failed alias retried rather than caching incomplete results');
console.log('Archive callsign regression PASS: aliases, shards, deduplication, cache, retry, history match');
