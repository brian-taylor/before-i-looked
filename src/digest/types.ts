// Plan morning-digest § 1. The contract every part of § 2 builds against; the reader lives in
// ./read.ts and exports `readNight` with exactly this signature.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, after parsing.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job for the night.
export type DigestRow = {
  job: string;
  owner: string | null; // null renders as `—`
  runs: number; // lines for this job, any status
  retries: number; // lines with status `retry`
  lastStatus: RunStatus;
  lastError: string | null; // `error` of the job's last line that had one
  first: string; // `at` of the first line, offset kept as logged
  last: string; // `at` of the last line, offset kept as logged
};

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job
  badLines: number; // lines that didn't parse; counted, never thrown
  counts: Record<RunStatus, number>; // lines per status, for the board
};

// null when runs/<night>.jsonl doesn't exist (the routes answer 404).
// An empty file gives a Night with no rows ("nothing ran").
export type ReadNight = (runsDir: string, night: string) => Night | null;
