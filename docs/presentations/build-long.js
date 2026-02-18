// Build script for Mark's Journey long presentation
// Set NODE_PATH for global modules
process.env.NODE_PATH = 'C:\\ProgramData\\global-npm\\node_modules';
require('module').Module._initPaths();

const PptxGenJS = require('pptxgenjs');
const fs = require('fs');
const path = require('path');

// Import html2pptx with absolute path
const html2pptx = require('C:\\Users\\cirvine\\.copilot\\skills\\pptx\\scripts\\html2pptx.js');

const workspaceDir = path.join(__dirname, 'workspace', 'long');
const outputPath = path.join(__dirname, 'marks-journey-long.pptx');

console.log('Building Mark\'s Journey (Long) presentation...');

const pres = new PptxGenJS();
pres.layout = 'LAYOUT_16x9';
pres.author = 'Product Team';
pres.title = "The Developer's Journey to Agentic AI";

// Convert all 10 slides
async function build() {
  for (let i = 1; i <= 10; i++) {
    const htmlPath = path.join(workspaceDir, `slide${i}.html`);
    console.log(`Converting slide ${i}...`);
    
    await html2pptx(htmlPath, pres);
  }

  await pres.writeFile({ fileName: outputPath });
  console.log(`✓ Presentation created: ${outputPath}`);
}

build().catch(err => {
  console.error('Error creating presentation:', err);
  process.exit(1);
});
