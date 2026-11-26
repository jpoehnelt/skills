#!/usr/bin/env node
import { main } from '../scripts/skills-sync.mjs';

const exitCode = await main(process.argv.slice(2));
process.exit(exitCode);
