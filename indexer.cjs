const path = require('path');
const fsp = require('fs').promises;
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const { glob } = require('glob');
const pdfParse = require('pdf-parse');
const JSZip = require('jszip');

const activeIndexingProcesses = new Map();
const INDEXES_DIR = path.join(__dirname, '.indexes');

const FILE_PROCESSING_TIMEOUT_MS = 15000;
const BATCH_SIZE = 100;

let currentIndexingToken = null;

fsp.mkdir(INDEXES_DIR, { recursive: true }).catch(console.error);

function getDbPath(folder) {
    const hash = crypto.createHash('md5').update(folder).digest('hex');
    return path.join(INDEXES_DIR, `${hash}.db`);
}

function initDb(folder) {
    const dbPath = getDbPath(folder);
    const db = new sqlite3.Database(dbPath);
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS files (id INTEGER PRIMARY KEY, name TEXT, fullpath TEXT UNIQUE, extension TEXT, mtime INTEGER, size INTEGER)`, (err) => { if (err) return reject(err); });
            db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS content USING fts5(fullpath UNINDEXED, filename, filepath, filecontent, tokenize = 'porter ascii')`, (err) => {
                if (err) console.warn('FTS5 not available:', err.message);
                resolve(db);
            });
        });
    });
}

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

async function extractContent(fullpath, extension) {
    const MAX_SIZE = 500 * 1024;
    try {
        const supportedExts = new Set(['txt', 'md', 'js', 'ts', 'html', 'css', 'py', 'java', 'json', 'xml', 'docx', 'xlsx', 'pdf', 'pptx']);
        if (!supportedExts.has(extension)) return null;
        if (extension === 'docx') return (await mammoth.extractRawText({ path: fullpath })).value.substring(0, MAX_SIZE);
        if (extension === 'xlsx') {
            const workbook = XLSX.readFile(fullpath);
            let allText = '';
            workbook.SheetNames.forEach(sheetName => { allText += XLSX.utils.sheet_to_txt(workbook.Sheets[sheetName]); });
            return allText.substring(0, MAX_SIZE);
        }
        if (extension === 'pdf') return (await pdfParse(fullpath)).text.substring(0, MAX_SIZE);
        if (extension === 'pptx') return (await extractPptxText(fullpath)).substring(0, MAX_SIZE);
        return (await fsp.readFile(fullpath, 'utf8')).substring(0, MAX_SIZE);
    } catch (error) {
        console.error(`Error extracting content from ${fullpath}:`, error.message);
        return null;
    }
}

async function indexFile(db, file) {
    console.log(`[Indexer] Processing: ${file.name}`);
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('File processing timed out')), FILE_PROCESSING_TIMEOUT_MS)
    );
    const processPromise = (async () => {
        const stat = await fsp.stat(file.fullpath);
        const mtime = Math.floor(stat.mtime.getTime() / 1000);
        await new Promise((resolve, reject) => {
            db.get('SELECT mtime FROM files WHERE fullpath = ?', [file.fullpath], (err, row) => {
                if (err || !row || row.mtime !== mtime) {
                    db.run(`INSERT OR REPLACE INTO files (name, fullpath, extension, mtime, size) VALUES (?, ?, ?, ?, ?)`,
                        [file.name, file.fullpath, file.extension, mtime, stat.size],
                        async (err) => {
                            if (err) return reject(err);
                            const content = await extractContent(file.fullpath, file.extension);
                            db.run(`INSERT OR REPLACE INTO content (fullpath, filename, filepath, filecontent) VALUES (?, ?, ?, ?)`,
                                [file.fullpath, file.name, file.fullpath, content],
                                (err) => err ? reject(err) : resolve()
                            );
                        }
                    );
                } else {
                    resolve();
                }
            });
        });
    })();
    try {
        await Promise.race([processPromise, timeoutPromise]);
    } catch (error) {
        console.error(`[Indexer] Skipping file "${file.name}" due to error: ${error.message}`);
    }
}

async function getAllFiles(dirPath) {
    try {
        await fsp.access(dirPath);
        return await glob('**/*', {
            cwd: dirPath,
            nodir: true,
            ignore: ['**/.git/**', '**/.indexes/**', '**/node_modules/**'],
            dot: false,
            absolute: true
        });
    } catch (err) {
        console.error(`Could not access or glob directory ${dirPath}:`, err.message);
        return [];
    }
}

async function indexFolder(folder) {
    const localToken = { cancelled: false };
    currentIndexingToken = localToken;

    // Immediately clear any previous status for this folder
    activeIndexingProcesses.delete(folder);
    const indexingState = { folder, status: 'starting', indexedCount: 0, totalFiles: 0 };
    activeIndexingProcesses.set(folder, indexingState);
    
    try {
        const allFilePaths = await getAllFiles(folder);
        if (allFilePaths.length === 0) { indexingState.status = 'complete'; return; }
        
        const db = await initDb(folder);
        const allFiles = allFilePaths.map(fp => ({ fullpath: fp, name: path.basename(fp), extension: path.extname(fp).toLowerCase().slice(1) }));
        indexingState.totalFiles = allFiles.length;
        indexingState.status = 'indexing';

        await new Promise((resolve) => db.run('BEGIN TRANSACTION', resolve));

        for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
            if (localToken.cancelled) {
                console.log(`[Indexer] Indexing for ${folder} was cancelled.`);
                db.run('ROLLBACK'); // Rollback changes if cancelled
                return;
            }
            const batch = allFiles.slice(i, i + BATCH_SIZE);
            const promises = batch.map(file => indexFile(db, file));
            await Promise.all(promises);
            indexingState.indexedCount += batch.length;
        }
        
        await new Promise((resolve) => db.run('COMMIT', resolve));
        await new Promise((resolve) => db.close(resolve));
    } catch (err) {
        console.error(`Error indexing folder ${folder}:`, err.message);
    } finally {
        indexingState.status = 'complete';
        setTimeout(() => {
            if (activeIndexingProcesses.get(folder) === indexingState) {
                activeIndexingProcesses.delete(folder);
            }
        }, 5000);
        if (currentIndexingToken === localToken) {
            currentIndexingToken = null;
        }
    }
}

function searchContent(folder, query) {
    const dbPath = getDbPath(folder);
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
    return new Promise((resolve, reject) => {
        let searchQuery = query.trim();
        if (!searchQuery) { db.close(); return resolve([]); }
        if (!(searchQuery.startsWith('"') && searchQuery.endsWith('"'))) {
            searchQuery = searchQuery.split(/\s+/).filter(Boolean).map(term => `"${term}"*`).join(' AND ');
        }
        const sql = `
            SELECT f.*, results.priority, results.rank FROM (
                SELECT fullpath, 1 AS priority, rank FROM content WHERE filename MATCH ?
                UNION ALL
                SELECT fullpath, 2 AS priority, rank FROM content WHERE filepath MATCH ?
                UNION ALL
                SELECT fullpath, 3 AS priority, rank FROM content WHERE filecontent MATCH ?
            ) AS results
            JOIN files f ON f.fullpath = results.fullpath
            GROUP BY f.fullpath
            ORDER BY MIN(results.priority) ASC, results.rank DESC LIMIT 100;
        `;
        db.all(sql, [searchQuery, searchQuery, searchQuery], (err, rows) => {
            db.close();
            if (err) return reject(err);
            const results = rows.map(row => ({
                id: Buffer.from(row.fullpath).toString('base64'), name: row.name, path: row.fullpath,
                extension: row.extension, size: row.size, modified: new Date(row.mtime * 1000).toISOString()
            }));
            resolve(results);
        });
    });
}

function cancelCurrentIndexing() {
    if (currentIndexingToken) {
        currentIndexingToken.cancelled = true;
    }
}

module.exports = {
    indexFolder,
    searchContent,
    getIndexingStatus: (folder) => activeIndexingProcesses.get(folder) || { status: 'idle' },
    cancelCurrentIndexing
};