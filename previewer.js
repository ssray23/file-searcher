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

async function previewFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Preview generation timed out')), PREVIEW_TIMEOUT_MS)
    );

    const doPreview = async () => {
        if (ext === '.docx') {
            const result = await mammoth.convertToHtml({ path: filePath });
            return result.value;
        } else if (ext === '.xlsx') {
            const workbook = new exceljs.Workbook();
            await workbook.xlsx.readFile(filePath);
            let html = '<table border="1">';
            workbook.eachSheet((sheet) => {
                html += `<tr><th colspan="${sheet.columnCount}">${sheet.name}</th></tr>`;
                sheet.eachRow((row) => {
                    html += '<tr>' + row.values.map(v => `<td>${v || ''}</td>`).join('') + '</tr>';
                });
            });
            html += '</table>';
            return html;
        } else if (ext === '.pptx') {
            return await extractPptxText(filePath);
        } else if (ext === '.psd') {
            const psd = await PSD.open(filePath);
            return psd.tree().export();
        } else if (ext === '.pdf') {
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdfParse(dataBuffer);
            return data.text;
        } else {
            return fs.readFileSync(filePath, 'utf8');
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