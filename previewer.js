const path = require('path');
const fs = require('fs');
const mammoth = require('mammoth');
const exceljs = require('exceljs');
const PSD = require('psd');
const pdfParse = require('pdf-parse');

async function previewFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
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
        throw new Error("Preview for .pptx files is not currently supported.");
    } else if (ext === '.psd') {
        const psd = await PSD.open(filePath);
        return psd.tree().export();
    } else if (ext === '.pdf') {
        try {
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdfParse(dataBuffer);
            return data.text;
        } catch (error) {
            console.error(`Error parsing PDF ${filePath}:`, error.message);
            if (error.message.includes("password")) {
                throw new Error("This PDF is password-protected and cannot be previewed.");
            }
            throw new Error("This PDF is too complex or may be corrupted. A preview could not be generated.");
        }
    } else {
        return fs.readFileSync(filePath, 'utf8');
    }
}

module.exports = { previewFile };