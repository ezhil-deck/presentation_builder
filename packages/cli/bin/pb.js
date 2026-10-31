#!/usr/bin/env node
import { buildProgram } from '../src/index.js';

buildProgram()
  .parseAsync(process.argv)
  .catch((err) => {
    console.error(`pb: ${err.message}`);
    process.exitCode = 1;
  });
