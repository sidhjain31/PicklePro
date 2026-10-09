// Runs the server and client dev servers together on any OS (npm's `&` needs a Unix shell).
import { spawn } from 'node:child_process';

const children = ['server', 'client'].map(dir =>
  spawn('npm', ['run', 'dev', '--prefix', dir], { stdio: 'inherit', shell: true }));
const stop = () => children.forEach(c => c.kill());
for (const c of children) c.on('exit', code => { stop(); process.exitCode = code ?? 0; });
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
