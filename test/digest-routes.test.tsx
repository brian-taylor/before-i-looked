import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-'));
const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: tmp,
};

const NORMAL = '2026-01-10';
const EMPTY = '2026-01-11';
const BAD = '2026-01-12';
const MISSING = '2026-01-13';

const line = (o: Record<string, unknown>) => JSON.stringify(o);
const at = (m: number) => `2026-01-10T02:${String(m).padStart(2, '0')}:00+01:00`;

beforeAll(() => {
  // Written out of order on purpose: rows must come back sorted by job.
  const normal = [
    line({ at: at(1), job: 'zeta-cleanup', status: 'ok', owner: 'sam' }),
    line({ at: at(2), job: 'mid-sync', status: 'retry', owner: 'ana' }),
    line({ at: at(3), job: 'mid-sync', status: 'retry', owner: 'ana' }),
    line({ at: at(4), job: 'mid-sync', status: 'retry', owner: 'ana' }),
    line({ at: at(5), job: 'mid-sync', status: 'ok', owner: 'ana' }),
    line({ at: at(6), job: 'beta-export', status: 'fail', owner: 'lee', error: 'disk full' }),
    line({ at: at(7), job: 'alpha-ownerless', status: 'ok', owner: null }),
    line({ at: at(8), job: 'omega-ok', status: 'ok', owner: 'sam' }),
  ];
  fs.writeFileSync(path.join(tmp, `${NORMAL}.jsonl`), normal.join('\n') + '\n');
  fs.writeFileSync(path.join(tmp, `${EMPTY}.jsonl`), '');
  fs.writeFileSync(
    path.join(tmp, `${BAD}.jsonl`),
    [
      line({ at: at(1), job: 'good-job', status: 'ok', owner: 'sam' }),
      '{"at":"2026-01-12T02:02:00+01:00","job":"trunc',
    ].join('\n') + '\n',
  );
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const app = () => createApp(config);

// The <tr ...> opening tag and body for the row that mentions `job`.
function rowFor(html: string, job: string): string {
  const row = html.split(/<tr[\s>]/).find((part) => part.includes(job));
  if (!row) throw new Error(`no row for ${job}`);
  return '<tr ' + row;
}
const rowTag = (row: string) => row.slice(0, row.indexOf('>') + 1);
const hasWarn = (row: string) => /class="[^"]*\bwarn\b/.test(rowTag(row));

describe('GET /digest/:night', () => {
  it('renders the table in the usual layout', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await app().request(`/digest/${NORMAL}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('TEST-MARKER');
    expect(html.match(/<table[\s>]/g)).toHaveLength(1);
    for (const job of ['alpha-ownerless', 'beta-export', 'mid-sync', 'omega-ok', 'zeta-cleanup']) {
      expect(html).toContain(job);
    }
  });

  it('marks rows with 3+ retries or a failing last status as warn', async () => {
    const html = await (await app().request(`/digest/${NORMAL}`)).text();
    expect(hasWarn(rowFor(html, 'mid-sync'))).toBe(true);
    expect(hasWarn(rowFor(html, 'beta-export'))).toBe(true);
    expect(hasWarn(rowFor(html, 'omega-ok'))).toBe(false);
    expect(hasWarn(rowFor(html, 'zeta-cleanup'))).toBe(false);
  });

  it('renders a null owner as an em dash', async () => {
    const html = await (await app().request(`/digest/${NORMAL}`)).text();
    expect(rowFor(html, 'alpha-ownerless')).toContain('—');
  });

  it('reports lines that did not parse', async () => {
    const res = await app().request(`/digest/${BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toMatch(/1 line\(s\) didn(?:'|&#39;)t parse/);
    expect(html).toContain('good-job');
  });

  it("doesn't mention bad lines when there are none", async () => {
    const html = await (await app().request(`/digest/${NORMAL}`)).text();
    expect(html).not.toMatch(/didn(?:'|&#39;)t parse/);
  });

  it('404s for a night with no file', async () => {
    const res = await app().request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
  });

  it('says "nothing ran" for an empty file', async () => {
    const res = await app().request(`/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the Night as JSON, sorted by job', async () => {
    const res = await app().request(`/api/digest/${NORMAL}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = (await res.json()) as Night;
    expect(body.night).toBe(NORMAL);
    expect(body.badLines).toBe(0);
    expect(body.counts).toEqual({ ok: 4, retry: 3, fail: 1 });
    expect(body.rows.map((r) => r.job)).toEqual([
      'alpha-ownerless',
      'beta-export',
      'mid-sync',
      'omega-ok',
      'zeta-cleanup',
    ]);
    const mid = body.rows.find((r) => r.job === 'mid-sync');
    expect(mid?.retries).toBe(3);
    expect(body.rows.find((r) => r.job === 'beta-export')?.lastStatus).toBe('fail');
  });

  it('keeps a null owner as null', async () => {
    const body = (await (await app().request(`/api/digest/${NORMAL}`)).json()) as Night;
    expect(body.rows.find((r) => r.job === 'alpha-ownerless')?.owner).toBeNull();
  });

  it('counts bad lines', async () => {
    const body = (await (await app().request(`/api/digest/${BAD}`)).json()) as Night;
    expect(body.badLines).toBe(1);
    expect(body.rows).toHaveLength(1);
  });

  it('404s with an error message for a night with no file', async () => {
    const res = await app().request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
  });

  it('returns no rows for an empty file', async () => {
    const res = await app().request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.rows).toEqual([]);
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order', async () => {
    const html = await (await app().request(`/digest/${NORMAL}`)).text();
    const body = (await (await app().request(`/api/digest/${NORMAL}`)).json()) as Night;
    const jobs = body.rows.map((r) => r.job);
    const positions = jobs.map((j) => html.indexOf(j));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
