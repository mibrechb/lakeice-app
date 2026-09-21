import {readdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const timeseriesDir = resolve('data/timeseries');
const output = resolve(timeseriesDir, 'available.json');

const entries = await readdir(timeseriesDir, {withFileTypes:true});

const ids = entries
  .filter((entry) =>
    entry.isFile() &&
    entry.name.toLowerCase().endsWith('.csv')
  )
  .map((entry) => entry.name.replace(/\.csv$/i, ''))
  .filter(Boolean)
  .sort((a, b) => a.localeCompare(b));

await writeFile(
  output,
  `${JSON.stringify(ids, null, 2)}\n`,
  'utf8',
);

console.log(
  `Wrote ${ids.length} available lake IDs to ${output}`,
);
