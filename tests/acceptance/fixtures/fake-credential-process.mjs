import { appendFileSync, writeFileSync } from 'node:fs';

const [sentinelPath, transcriptPath] = process.argv.slice(2);
if (!sentinelPath || !transcriptPath) {
  process.stderr.write('usage: fake-credential-process.mjs <sentinel> <transcript>\n');
  process.exit(2);
}

writeFileSync(sentinelPath, 'credential-process-alive\n', 'utf8');
writeFileSync(transcriptPath, '', 'utf8');
process.stdout.write('READY\n');
process.stdin.setEncoding('utf8');

let buffered = '';
process.stdin.on('data', (chunk) => {
  buffered += chunk;
  for (;;) {
    const newline = buffered.indexOf('\n');
    if (newline < 0) break;
    const line = buffered.slice(0, newline).trim();
    buffered = buffered.slice(newline + 1);
    if (!line) continue;

    let type = 'invalid';
    try {
      const message = JSON.parse(line);
      type = typeof message?.type === 'string' ? message.type : 'invalid';
    } catch {
      type = 'invalid';
    }
    appendFileSync(transcriptPath, `${type}\n`, 'utf8');
    if (type === 'health.ping') process.stdout.write('{"type":"health.pong"}\n');
    else process.stdout.write('{"type":"rejected"}\n');
  }
});
