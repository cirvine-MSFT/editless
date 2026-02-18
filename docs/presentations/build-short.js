// Set up NODE_PATH for global modules
process.env.NODE_PATH = 'C:\\ProgramData\\global-npm\\node_modules';
require('module').Module._initPaths();

const PptxGenJS = require('pptxgenjs');
const html2pptx = require('C:\\Users\\cirvine\\.copilot\\skills\\pptx\\scripts\\html2pptx.js');
const fs = require('fs');
const path = require('path');

async function buildPresentation() {
    const pres = new PptxGenJS();
    
    // Set presentation properties
    pres.layout = 'LAYOUT_16x9';
    pres.author = 'Leadership Team';
    pres.title = "The Developer's Journey to Agentic AI";
    
    const workspaceDir = path.join(__dirname, 'workspace', 'short');
    const slides = [
        'slide1.html',
        'slide2.html',
        'slide3.html',
        'slide4.html',
        'slide5.html',
        'slide6.html',
        'slide7.html'
    ];
    
    console.log('Converting HTML slides to PowerPoint...');
    
    for (let i = 0; i < slides.length; i++) {
        const slideFile = slides[i];
        const htmlPath = path.join(workspaceDir, slideFile);
        console.log(`Processing ${slideFile}...`);
        
        await html2pptx(htmlPath, pres);
        
        // Slide 6 (index 5): add the capability curve chart image
        if (i === 5) {
            const slide = pres.slides[pres.slides.length - 1];
            const imgPath = path.join(workspaceDir, 'capability-curve.png');
            slide.addImage({
                path: imgPath,
                x: 1.2, y: 1.3, w: 7.6, h: 3.5,
                sizing: { type: 'contain', w: 7.6, h: 3.5 }
            });
        }
    }
    
    const outputPath = path.join(__dirname, 'marks-journey-short.pptx');
    await pres.writeFile({ fileName: outputPath });
    
    console.log(`\nPresentation created successfully: ${outputPath}`);
}

buildPresentation().catch(err => {
    console.error('Error building presentation:', err);
    process.exit(1);
});
