#!/usr/bin/env node
/**
 * Local test for the /biometrics WebSocket gateway. Simulates the ESP32 firmware
 * (device role) and an admin app (client role) in one process.
 *
 *   node biometrics-test.cjs                                          # ping only
 *   node biometrics-test.cjs --user-type professor --user-id <uuid>   # + register, time in, duplicate
 *   ... --wait-timeout                                                # + waits 61 s, scans again -> time out
 *   ... --reset                                                       # + admin reset of all registrations
 *   ... --real-device   # do NOT start the fake ESP32; talk to whatever real device is connected
 *
 * Env (match the server's): BIOMETRIC_DEVICE_TOKEN, BIOMETRIC_CLIENT_TOKEN, BIOMETRIC_ENROLL_TOKEN
 * Optional: URL (default ws://localhost:3000/biometrics), DEVICE_ID (default aris-bio-test)
 */
const WebSocket = require('ws');

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const BASE = process.env.URL || 'ws://localhost:3000/biometrics';
const DEVICE_ID = process.env.DEVICE_ID || 'aris-bio-test';
const DEVICE_TOKEN = process.env.BIOMETRIC_DEVICE_TOKEN || '';
const CLIENT_TOKEN = process.env.BIOMETRIC_CLIENT_TOKEN || '';
const ENROLL_TOKEN = process.env.BIOMETRIC_ENROLL_TOKEN || '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (tag, ...a) => console.log(`[${tag}]`, ...a);
const env = (o) =>
  JSON.stringify({ protocol: 'aris-biometric', protocolVersion: 1, ...o });

// ───────────────────────── Fake ESP32 ─────────────────────────
function startDevice() {
  return new Promise((resolve, reject) => {
    const headers = DEVICE_TOKEN
      ? { Authorization: `Bearer ${DEVICE_TOKEN}` }
      : {};
    const ws = new WebSocket(`${BASE}?deviceId=${DEVICE_ID}`, { headers });
    const slots = new Set();
    let lastSlot = null;

    const out = (o) => ws.send(env(o));
    const ok = (id, command, data) =>
      out({
        type: 'response',
        requestId: id,
        command,
        success: true,
        data,
        error: null,
      });
    const err = (id, command, code, message) =>
      out({
        type: 'response',
        requestId: id,
        command,
        success: false,
        data: null,
        error: { code, message, retryable: false },
      });
    const evt = (id, command, event, data) =>
      out({ type: 'event', requestId: id, command, event, data });

    ws.on('open', () => {
      log('device', 'connected');
      evt(null, null, 'device_ready', {
        deviceId: DEVICE_ID,
        firmwareVersion: 'test',
        sensorStatus: 'ready',
        templateCount: slots.size,
        enrollmentRequired: slots.size === 0,
      });
      resolve(device);
    });
    ws.on('error', (e) => {
      log('device', 'error', e.message);
      reject(e);
    });
    ws.on('close', (c) => log('device', 'closed', c));

    ws.on('message', async (raw) => {
      const m = JSON.parse(raw.toString());
      const { requestId: id, command: cmd } = m;
      log('device', '<-', cmd, id);
      switch (cmd) {
        case 'ping':
          return ok(id, 'ping', {
            pong: true,
            deviceId: DEVICE_ID,
            uptimeMs: (process.uptime() * 1000) | 0,
          });
        case 'enroll':
          if (ENROLL_TOKEN && m.authToken !== ENROLL_TOKEN)
            return err(
              id,
              'enroll',
              'unauthorized',
              'Token missing or incorrect',
            );
          if (slots.has(m.slot))
            return err(
              id,
              'enroll',
              'slot_occupied',
              'Slot already holds a template',
            );
          evt(id, 'enroll', 'started', { slot: m.slot, totalSamples: 2 });
          evt(id, 'enroll', 'enroll_progress', {
            step: 'place_finger',
            sample: 1,
            totalSamples: 2,
          });
          await sleep(300);
          evt(id, 'enroll', 'enroll_progress', {
            step: 'remove_finger',
            sample: 1,
            totalSamples: 2,
          });
          await sleep(300);
          evt(id, 'enroll', 'enroll_progress', {
            step: 'place_finger',
            sample: 2,
            totalSamples: 2,
          });
          await sleep(300);
          slots.add(m.slot);
          lastSlot = m.slot;
          return ok(id, 'enroll', {
            enrolled: true,
            slot: m.slot,
            templateCount: slots.size,
            durationMs: 900,
          });
        case 'match':
          evt(id, 'match', 'started', { timeoutMs: m.timeoutMs });
          await sleep(200);
          if (lastSlot == null)
            return err(
              id,
              'match',
              'no_match',
              'Fingerprint not found in sensor database',
            );
          return ok(id, 'match', {
            matched: true,
            slot: lastSlot,
            score: 120,
            durationMs: 200,
          });
        case 'delete_template':
          slots.delete(m.slot);
          return ok(id, 'delete_template', {
            deleted: true,
            slot: m.slot,
            templateCount: slots.size,
          });
        case 'clear_templates':
          if (ENROLL_TOKEN && m.authToken !== ENROLL_TOKEN)
            return err(
              id,
              'clear_templates',
              'unauthorized',
              'Token missing or incorrect',
            );
          slots.clear();
          lastSlot = null;
          return ok(id, 'clear_templates', {
            cleared: true,
            templateCount: 0,
            enrollmentRequired: true,
          });
        default:
          return err(id, cmd, 'unknown_command', 'Unsupported command');
      }
    });

    // what listen mode does on a successful scan
    const device = {
      ws,
      get lastSlot() {
        return lastSlot;
      },
      scan(slot = lastSlot) {
        log('device', '-> auto_match slot', slot);
        evt(`auto-${Date.now() % 100000}`, 'listen', 'auto_match', {
          matched: true,
          slot,
          score: 120,
        });
      },
      close: () => ws.close(),
    };
  });
}

// ───────────────────────── Admin client ─────────────────────────
function startClient() {
  return new Promise((resolve, reject) => {
    const q = new URLSearchParams({ role: 'client' });
    if (CLIENT_TOKEN) q.set('token', CLIENT_TOKEN);
    const ws = new WebSocket(`${BASE}?${q}`);
    const waiting = new Map(); // requestId -> resolve
    const listeners = [];
    let n = 0;

    ws.on('error', (e) => {
      log('client', 'error', e.message);
      reject(e);
    });
    ws.on('close', (c) => log('client', 'closed', c));
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.type === 'response' && waiting.has(m.requestId)) {
        waiting.get(m.requestId)(m);
        waiting.delete(m.requestId);
      } else if (m.type === 'event') {
        log('client', 'event', m.event, JSON.stringify(m.data));
        listeners.slice().forEach((l) => l(m));
      }
    });

    const client = {
      request(command, fields = {}, timeoutMs = 30000) {
        const requestId = `t-${++n}`;
        return new Promise((res, rej) => {
          const t = setTimeout(
            () => rej(new Error(`${command}: timeout`)),
            timeoutMs,
          );
          waiting.set(requestId, (m) => {
            clearTimeout(t);
            res(m);
          });
          ws.send(env({ requestId, command, ...fields }));
        });
      },
      waitEvent(name, timeoutMs = 5000) {
        return new Promise((res, rej) => {
          const t = setTimeout(
            () => rej(new Error(`event ${name}: timeout`)),
            timeoutMs,
          );
          const l = (m) => {
            if (m.event !== name) return;
            clearTimeout(t);
            listeners.splice(listeners.indexOf(l), 1);
            res(m);
          };
          listeners.push(l);
        });
      },
      close: () => ws.close(),
    };
    ws.on('open', () => {
      log('client', 'connected');
      resolve(client);
    });
  });
}

const show = (label, m) =>
  log(
    'result',
    label.padEnd(20),
    m.success ? 'OK  ' : 'FAIL',
    JSON.stringify(m.success ? m.data : m.error),
  );

// ───────────────────────── Run ─────────────────────────
(async () => {
  const device = flag('real-device') ? null : await startDevice(); // null = use the real ESP32
  await sleep(500); // let the server's ping round-trip
  const client = await startClient();

  show('ping (server)', await client.request('ping'));
  show(
    'ping (device)',
    await client.request('ping', {
      target: 'device',
      deviceId: device ? DEVICE_ID : undefined,
    }),
  );
  show('device_status', await client.request('device_status'));

  const userType = opt('user-type');
  const userId = opt('user-id');
  if (userId) {
    const reg = await client.request('register', { userType, userId });
    show('register', reg);

    const slot = reg.success ? reg.data.slot : device?.lastSlot;
    if (slot != null && device) {
      let p = client.waitEvent('punch');
      device.scan(slot);
      const t1 = await p.catch((e) => ({ data: e.message }));
      log('result', 'scan #1 (expect time_in)  ', JSON.stringify(t1.data));

      p = client.waitEvent('punch');
      device.scan(slot);
      const t2 = await p.catch((e) => ({ data: e.message }));
      log('result', 'scan #2 (expect duplicate)', JSON.stringify(t2.data));

      if (flag('wait-timeout')) {
        log('test', 'waiting 61 s for the debounce window...');
        await sleep(61000);
        p = client.waitEvent('punch');
        device.scan(slot);
        const t3 = await p.catch((e) => ({ data: e.message }));
        log('result', 'scan #3 (expect time_out)', JSON.stringify(t3.data));
      }
      show(
        'verify (on demand)',
        await client.request('verify', { deviceId: DEVICE_ID }),
      );
    }
    if (!device)
      show('verify (place finger)', await client.request('verify', {}, 20000));
    show('today', await client.request('today', { userType, userId }));
  }

  if (flag('reset'))
    show('reset_registrations', await client.request('reset_registrations'));

  client.close();
  device?.close();
  await sleep(200);
  process.exit(0);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
