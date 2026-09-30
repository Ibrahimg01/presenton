import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readDocumentText } from '../../servers/nextjs/utils/document-files.ts';

test('document previews exclude credentials, siblings, symlinks and oversized files', () => {
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'presenton-security-'));
  const root=path.join(base,'documents');fs.mkdirSync(root);
  try {
    const good=path.join(root,'upload.txt');fs.writeFileSync(good,'Valid extracted document');
    assert.equal(readDocumentText(good,root),'Valid extracted document');
    const config=path.join(root,'userConfig.json');fs.writeFileSync(config,'{"OPENAI_API_KEY":"test-secret"}');
    assert.throws(()=>readDocumentText(config,root));
    const outside=path.join(base,'secret.txt');fs.writeFileSync(outside,'not a document');
    assert.throws(()=>readDocumentText(outside,root));
    const link=path.join(root,'escape.txt');fs.symlinkSync(outside,link);
    assert.throws(()=>readDocumentText(link,root));
    assert.throws(()=>readDocumentText(path.join(root,'..','secret.txt'),root));
    assert.throws(()=>readDocumentText('upload.txt',root));
    assert.throws(()=>readDocumentText(null,root));
    assert.throws(()=>readDocumentText(good,'/'));
    const big=path.join(root,'large.txt');fs.writeFileSync(big,Buffer.alloc(2*1024*1024+1));
    assert.throws(()=>readDocumentText(big,root));
    assert.throws(()=>readDocumentText(root,root));
  } finally {fs.rmSync(base,{recursive:true,force:true});}
});
