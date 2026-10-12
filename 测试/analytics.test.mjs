import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../网站资源/脚本/访问统计.js', import.meta.url), 'utf8');
function setup(options = {}) {
  const scripts = [], sent = [], storage = new Map();
  if (options.disabled) storage.set('metro.analytics.disabled', '1');
  const context = {
    URL, Promise, Set, navigator: { doNotTrack: options.dnt ? '1' : '0' },
    location: { hostname: options.host || 'lcx-luo.github.io', protocol: 'https:', origin: 'https://lcx-luo.github.io', pathname: '/Chengdu-metro/' },
    localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) },
    document: { addEventListener() {}, head: { appendChild: s => scripts.push(s) }, createElement: () => ({ setAttribute() {} }) },
    MetroAnalyticsConfig: { websiteId: options.blank ? '' : '01234567-1234-1234-1234-0123456789ab', scriptUrl: 'https://cloud.umami.is/script.js', hostname: 'lcx-luo.github.io' },
  };
  context.window = context; context.parent = options.parent || context;
  vm.runInNewContext(source, context);
  return { context, scripts, sent, storage, ready() { context.umami = { track: name => sent.push(name) }; scripts[0].onload(); } };
}
for (const option of [{ blank: true }, { host: '127.0.0.1' }, { disabled: true }, { dnt: true }]) {
  const s = setup(option); s.context.MetroAnalytics.track('import-csv-success'); assert.equal(s.scripts.length, 0);
}
const s = setup();
assert.equal(s.scripts.length, 1);
s.context.MetroAnalytics.track('import-csv-success', { filename: 'private.pdf', amount: 123 });
s.context.MetroAnalytics.track('unknown-event');
s.ready();
assert.deepEqual(s.sent, ['import-csv-success']);
const payload = s.context.metroAnalyticsBeforeSend('event', {
  website: 'id', url: '/Chengdu-metro/?station=private#secret', referrer: 'https://example.org/private?token=secret',
  name: 'import-pdf-success', data: { filename: 'private.pdf' }, id: 'persistent-id', amount: 123,
});
assert.equal(payload.url, '/Chengdu-metro/'); assert.equal(payload.referrer, 'https://example.org');
assert.equal(payload.data, undefined); assert.equal(payload.id, undefined); assert.equal(payload.amount, undefined);
assert.equal(s.context.metroAnalyticsBeforeSend('identify', {}), false);
assert.equal(s.context.metroAnalyticsBeforeSend('event', { name: 'private-station' }), false);
s.context.MetroAnalytics.setDisabled(true);
assert.equal(s.context.metroAnalyticsBeforeSend('event', {}), false);
s.context.MetroAnalytics.track('export-trips'); assert.equal(s.sent.length, 1);
const calls = [];
const child = setup({ parent: { location: { origin: 'https://lcx-luo.github.io' }, MetroAnalytics: { track: n => calls.push(n) } } });
assert.equal(child.scripts.length, 0); child.context.MetroAnalytics.track('export-trips'); assert.deepEqual(calls, ['export-trips']);
const failure = setup(); failure.context.umami = { track() { throw Error('blocked'); } }; failure.scripts[0].onload();
assert.doesNotThrow(() => failure.context.MetroAnalytics.track('view-costs'));
for (const file of ['index.html', 'time_analysis.html']) {
  const html = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) if (match[1].trim()) new vm.Script(match[1]);
}
console.log('PASS: analytics privacy, opt-out, offline, embedded deduplication, failure isolation and HTML script syntax.');
