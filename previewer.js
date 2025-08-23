const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
const mammoth = require('mammoth');
const exceljs = require('exceljs');
const PSD = require('psd');
const pdfParse = require('pdf-parse');
const JSZip = require('jszip');

const PREVIEW_TIMEOUT_MS = 10000;

async function extractPptxText(filePath) {
    const content = await fsp.readFile(filePath);
    const zip = await JSZip.loadAsync(content);
    const slideFiles = Object.keys(zip.files).filter(name => name.startsWith('ppt/slides/slide'));
    let fullText = '';
    for (const slideFile of slideFiles) {
        const slideContent = await zip.file(slideFile).async('string');
        const textNodes = slideContent.match(/<a:t>.*?<\/a:t>/g) || [];
        fullText += textNodes.map(node => node.replace(/<.*?>/g, '')).join(' ') + '\n';
    }
    return fullText;
}

// Replace the DOCX handling in previewer.js with this:

async function previewFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Preview generation timed out')), PREVIEW_TIMEOUT_MS)
    );

    const doPreview = async () => {
        if (ext === '.docx') {
            // Extract HTML with formatting instead of raw text
            const result = await mammoth.convertToHtml({ path: filePath });
            return { type: 'html', content: result.value };
        } else if (ext === '.xlsx') {
            const workbook = new exceljs.Workbook();
            await workbook.xlsx.readFile(filePath);
            let html = '<table border="1" style="border-collapse: collapse; width: 100%;">';
            workbook.eachSheet((sheet) => {
                html += `<tr><th colspan="${sheet.columnCount}" style="background-color: #f0f0f0; padding: 8px; text-align: center; font-weight: bold;">${sheet.name}</th></tr>`;
                sheet.eachRow((row, rowIndex) => {
                    const style = rowIndex === 1 ? 'background-color: #f8f8f8; font-weight: bold;' : '';
                    html += `<tr style="${style}">` + 
                           row.values.slice(1).map(v => `<td style="padding: 4px; border: 1px solid #ddd;">${v || ''}</td>`).join('') + 
                           '</tr>';
                });
            });
            html += '</table>';
            return { type: 'html', content: html };
        } else if (ext === '.pptx') {
            const text = await extractPptxText(filePath);
            return { type: 'text', content: text };
        } else if (ext === '.psd') {
            const psd = await PSD.open(filePath);
            const exported = psd.tree().export();
            return { type: 'text', content: JSON.stringify(exported, null, 2) };
        } else if (ext === '.pdf') {
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdfParse(dataBuffer);
            return { type: 'text', content: data.text };
        } else {
            const content = fs.readFileSync(filePath, 'utf8');
            return { type: 'text', content: content };
        }
    };

    try {
        return await Promise.race([doPreview(), timeoutPromise]);
    } catch (error) {
        console.error(`Error generating preview for ${filePath}:`, error.message);
        if (error.message.includes("password")) {
            throw new Error("This PDF is password-protected and cannot be previewed.");
        }
        throw new Error("Could not generate a preview for this file. It may be corrupted or too complex.");
    }
}
module.exports = { previewFile };