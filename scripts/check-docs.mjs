#!/usr/bin/env node
/**
 * The documentation check.
 *
 * A checklist already existed ("Docs updated if behavior changed") and it did not stop a
 * stale test count shipping twice, a README status table that said "PR 2, you are here"
 * several PRs later, a SETUP.md pointing at a hostname that did not exist yet, or two
 * rounds of British spellings landing despite the convention being written down in
 * CLAUDE.md. Checklists catch what you remember to look at. This catches the rest.
 *
 * It only checks what can be checked mechanically. Whether a document is still *true* is a
 * human job, and the checklist in CLAUDE.md is where that lives.
 *
 * Run: npm run check:docs
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const problems = [];
const report = (file, line, message) =>
  problems.push(`${relative(root, file)}${line ? `:${line}` : ''}  ${message}`);

/**
 * Every file git would keep: tracked, plus untracked ones that are not ignored. That
 * excludes node_modules, dist and scratch files, and — the reason for `--others` — means a
 * brand new file is checked before it is committed rather than after. Listing only tracked
 * files made this script's own coverage depend on whether `git add` had happened yet.
 */
function tracked(pattern) {
  return execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', pattern],
    { cwd: root, encoding: 'utf8' },
  )
    .split('\n')
    .filter(Boolean)
    .map((f) => join(root, f));
}

const markdown = tracked('*.md');

// --- 1. Relative links must resolve ---------------------------------------------------
// Catches an ADR renamed without updating the index, a doc moved, a typo'd path.
const LINK = /\[[^\]]*\]\(([^)]+)\)/g;

for (const file of markdown) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((text, i) => {
    for (const [, target] of text.matchAll(LINK)) {
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const path = target.split('#')[0];
      if (!path) continue;
      // A PR template's content becomes the pull request body, where GitHub resolves
      // relative links against the repository root rather than the template's own
      // directory. Checking it like an ordinary file would flag correct links.
      const base = file.endsWith('pull_request_template.md') ? root : dirname(file);
      if (!existsSync(resolve(base, path))) {
        report(file, i + 1, `broken link -> ${target}`);
      }
    }
  });
}

// --- 2. The ADR index must match the ADRs that exist ----------------------------------
// Adding an ADR and forgetting the index has happened for 0006 and 0008, both caught by
// hand. This is the part a person is least likely to notice in review.
const adrIndexPath = join(root, 'docs/adr/README.md');
const adrIndex = readFileSync(adrIndexPath, 'utf8');

for (const file of tracked('docs/adr/*.md')) {
  const name = file.split('/').pop();
  if (name === 'README.md' || name.startsWith('0000-')) continue;

  if (!adrIndex.includes(name)) {
    report(adrIndexPath, null, `ADR ${name} exists but is not in the index`);
  }
  if (!/^\*\*Status:\*\* \w/m.test(readFileSync(file, 'utf8'))) {
    report(file, null, 'ADR has no "**Status:**" line');
  }
}

// --- 3. Do not write down facts that drift --------------------------------------------
// The cheapest documentation check is not stating something that goes stale. "54 tests"
// was wrong in two files at once; the fix was to stop claiming a number, not to police it.
for (const file of markdown) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((text, i) => {
      const match = /\b\d+\s+tests\b/.exec(text);
      if (match) {
        report(file, i + 1, `states a test count ("${match[0]}") -- numbers like this go stale`);
      }
    });
}

// --- 4. American English ---------------------------------------------------------------
// A maintained word list rather than clever patterns. "-our"/"-ise" rules produce false
// positives on promise, wise, exercise; and they would not have caught "yoghurt", which is
// the one that actually got through. When a new one slips past, add it here -- that is the
// whole mechanism.
const BRITISH = {
  behaviour: 'behavior', favour: 'favor', colour: 'color', flavour: 'flavor',
  honour: 'honor', humour: 'humor', labour: 'labor', neighbour: 'neighbor',
  odour: 'odor', rumour: 'rumor', savour: 'savor', vapour: 'vapor',
  endeavour: 'endeavor',
  organise: 'organize', recognise: 'recognize', optimise: 'optimize',
  prioritise: 'prioritize', utilise: 'utilize', summarise: 'summarize',
  minimise: 'minimize', maximise: 'maximize', realise: 'realize',
  specialise: 'specialize', customise: 'customize', normalise: 'normalize',
  serialise: 'serialize', initialise: 'initialize', apologise: 'apologize',
  categorise: 'categorize', standardise: 'standardize', authorise: 'authorize',
  synchronise: 'synchronize', visualise: 'visualize', analyse: 'analyze',
  paralyse: 'paralyze',
  centre: 'center', metre: 'meter', litre: 'liter', theatre: 'theater',
  fibre: 'fiber', calibre: 'caliber', spectre: 'specter',
  defence: 'defense', offence: 'offense', pretence: 'pretense',
  judgement: 'judgment', acknowledgement: 'acknowledgment',
  cancelled: 'canceled', labelled: 'labeled', modelling: 'modeling',
  travelling: 'traveling', marvellous: 'marvelous', signalling: 'signaling',
  fulfil: 'fulfill', skilful: 'skillful', wilful: 'willful',
  grey: 'gray', whilst: 'while', amongst: 'among', learnt: 'learned',
  spelt: 'spelled', burnt: 'burned', dreamt: 'dreamed',
  aeroplane: 'airplane', tyre: 'tire', kerb: 'curb', storey: 'story',
  plough: 'plow', draught: 'draft', mould: 'mold', cheque: 'check',
  programme: 'program', sceptic: 'skeptic', aluminium: 'aluminum',
  manoeuvre: 'maneuver', orientated: 'oriented', speciality: 'specialty',
  fortnight: 'two weeks', trolley: 'cart', yoghurt: 'yogurt',
  aubergine: 'eggplant', courgette: 'zucchini',
};

const AUTHORED = ['*.md', '*.ts', '*.tsx', '*.css', '*.html', '*.sql', '*.py', '*.yml'];
const authored = [...new Set(AUTHORED.flatMap(tracked))].filter(
  // This file lists the words it looks for, so it would flag itself.
  (f) => f !== resolve(import.meta.filename),
);

const anyBritish = new RegExp(`\\b(${Object.keys(BRITISH).join('|')})\\b`, 'gi');

/**
 * Sometimes a British word is data rather than prose — the categorization dictionary lists
 * "courgette" so that typing it still finds the right aisle. Mark those regions:
 *
 *   check-docs: allow-british:start  (say why)
 *   ...
 *   check-docs: allow-british:end
 *
 * Deliberately narrow and visible. Exempting a whole file would quietly let real British
 * prose in alongside the data.
 */
const ALLOW_START = /check-docs: allow-british:start/;
const ALLOW_END = /check-docs: allow-british:end/;

for (const file of authored) {
  let allowed = false;
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((text, i) => {
      if (ALLOW_START.test(text)) allowed = true;
      else if (ALLOW_END.test(text)) allowed = false;
      if (allowed) return;

      for (const [word] of text.matchAll(anyBritish)) {
        const american = BRITISH[word.toLowerCase()];
        report(file, i + 1, `"${word}" -- house style is American English, use "${american}"`);
      }
    });
}

// --- report ----------------------------------------------------------------------------
if (problems.length === 0) {
  console.log(`Documentation check passed (${markdown.length} markdown files, ${authored.length} authored files).`);
  process.exit(0);
}

console.error(`Documentation check found ${problems.length} problem(s):\n`);
for (const problem of problems) console.error(`  ${problem}`);
console.error('\nSee the documentation checklist in CLAUDE.md for the parts a person has to judge.');
process.exit(1);
