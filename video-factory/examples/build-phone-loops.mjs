import { readFileSync, writeFileSync } from 'node:fs';
import { buildManifest, buildSnapshot, fallbackScript } from '../src/pipeline.ts';

const projects = JSON.parse(readFileSync('../data/projects_live.json', 'utf8'));
const articles = JSON.parse(readFileSync('../data/case_articles.json', 'utf8'));
const caseId = process.argv[2] || '1cc543ff648e';
const jobId = process.argv[3] || `local-${caseId}`;
const output = process.argv[4] || `examples/${caseId}.manifest.json`;
const project = projects.find(item => item.id === caseId);
const article = articles.find(item => item.projectId === caseId);
if (!project) throw new Error(`case not found: ${caseId}`);
const snapshot = buildSnapshot(project, article, '2026-07-31T00:00:00Z');
const script = fallbackScript(snapshot);
const manifest = buildManifest(jobId, snapshot, script, 1);
writeFileSync(output, JSON.stringify(manifest, null, 2));
console.log(`wrote ${output} with ${manifest.script.beats.length} beats and ${manifest.caseSnapshot.media.length} media items`);
