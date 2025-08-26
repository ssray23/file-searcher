const path = require('path');
const fsp = require('fs').promises;
const fs = require('fs');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const pdfParse = require('pdf-parse');
const JSZip = require('jszip');

const activeIndexingProcesses = new Map();
const INDEXES_DIR = path.join(__dirname, '.indexes');

const FILE_PROCESSING_TIMEOUT_MS = 15000;
const BATCH_SIZE = 100;

let currentIndexingToken = null;
const watchedFolders = new Set(); // Track all indexed folders

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
            // Check if files table exists and has the correct schema
            db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='files'", (err, row) => {
                if (err) {
                    console.error('Error checking table schema:', err);
                    return reject(err);
                }
                
                let needsSchemaUpdate = false;
                
                if (row) {
                    // Table exists, check if it has fullpath column
                    if (!row.sql.includes('fullpath')) {
                        console.log('[Indexer] Updating database schema to add fullpath column');
                        needsSchemaUpdate = true;
                    }
                } else {
                    // Table doesn't exist, will be created with correct schema
                    needsSchemaUpdate = false;
                }
                
                if (needsSchemaUpdate) {
                    // Drop and recreate tables with correct schema
                    db.run("DROP TABLE IF EXISTS files", (dropErr) => {
                        if (dropErr) {
                            console.error('Error dropping files table:', dropErr);
                            return reject(dropErr);
                        }
                        
                        db.run("DROP TABLE IF EXISTS content", (dropContentErr) => {
                            if (dropContentErr) {
                                console.warn('Error dropping content table:', dropContentErr);
                                // Continue anyway, as content table might be virtual
                            }
                            
                            createTables();
                        });
                    });
                } else {
                    createTables();
                }
                
                function createTables() {
                    // Create files table with correct schema
                    db.run(`CREATE TABLE IF NOT EXISTS files (
                        id INTEGER PRIMARY KEY, 
                        name TEXT, 
                        fullpath TEXT UNIQUE, 
                        extension TEXT, 
                        mtime INTEGER, 
                        size INTEGER
                    )`, (err) => {
                        if (err) {
                            console.error('Error creating files table:', err);
                            return reject(err);
                        }
                        
                        // Create content table (try FTS5 first, fallback to regular table)
                        db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS content USING fts5(
                            fullpath UNINDEXED, 
                            filename, 
                            filepath, 
                            filecontent, 
                            tokenize = 'porter ascii'
                        )`, (err) => {
                            if (err) {
                                console.warn('FTS5 not available, falling back to regular table:', err.message);
                                // Create a regular table as fallback
                                db.run(`CREATE TABLE IF NOT EXISTS content (
                                    fullpath TEXT PRIMARY KEY,
                                    filename TEXT,
                                    filepath TEXT,
                                    filecontent TEXT
                                )`, (fallbackErr) => {
                                    if (fallbackErr) {
                                        console.error('Error creating fallback content table:', fallbackErr);
                                        return reject(fallbackErr);
                                    }
                                    resolve(db);
                                });
                            } else {
                                resolve(db);
                            }
                        });
                    });
                }
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
        
        if (extension === 'docx') {
            return (await mammoth.extractRawText({ path: fullpath })).value.substring(0, MAX_SIZE);
        }
        if (extension === 'xlsx') {
            const workbook = XLSX.readFile(fullpath);
            let allText = '';
            workbook.SheetNames.forEach(sheetName => {
                allText += XLSX.utils.sheet_to_txt(workbook.Sheets[sheetName]);
            });
            return allText.substring(0, MAX_SIZE);
        }
        if (extension === 'pdf') {
            const dataBuffer = await fsp.readFile(fullpath);
            return (await pdfParse(dataBuffer)).text.substring(0, MAX_SIZE);
        }
        if (extension === 'pptx') {
            return (await extractPptxText(fullpath)).substring(0, MAX_SIZE);
        }
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
            db.get('SELECT mtime FROM files WHERE fullpath = ?', [file.fullpath], async (err, row) => {
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

// Use Node.js built-in recursive directory reading instead of glob
async function getAllFiles(dirPath) {
    try {
        await fsp.access(dirPath);
        console.log(`[Indexer] Scanning directory: ${dirPath}`);
        
        const files = [];
        
        async function scanDirectory(currentPath) {
            const entries = await fsp.readdir(currentPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(currentPath, entry.name);
                
                // Skip ignored directories
                const relativePath = path.relative(dirPath, fullPath);
                if (relativePath.includes('.git') || 
                    relativePath.includes('.indexes') || 
                    relativePath.includes('node_modules') ||
                    entry.name.startsWith('.')) {
                    continue;
                }
                
                if (entry.isDirectory()) {
                    await scanDirectory(fullPath);
                } else if (entry.isFile()) {
                    files.push(fullPath);
                }
            }
        }
        
        await scanDirectory(dirPath);
        console.log(`[Indexer] Found ${files.length} files`);
        return files;
        
    } catch (err) {
        console.error(`Could not access directory ${dirPath}:`, err.message);
        return [];
    }
}

async function indexFolder(folder) {
    const localToken = { cancelled: false };
    currentIndexingToken = localToken;

    console.log(`[Indexer] Starting indexing for: ${folder}`);
    
    // Track this folder as indexed
    watchedFolders.add(folder);
    
    // Clear any previous status for this folder
    activeIndexingProcesses.delete(folder);
    const indexingState = { folder, status: 'starting', indexedCount: 0, totalFiles: 0 };
    activeIndexingProcesses.set(folder, indexingState);
    
    try {
        const allFilePaths = await getAllFiles(folder);
        if (allFilePaths.length === 0) {
            console.log(`[Indexer] No files found in ${folder}`);
            indexingState.status = 'complete';
            return;
        }
        
        console.log(`[Indexer] Initializing database for ${folder}`);
        const db = await initDb(folder);
        const allFiles = allFilePaths.map(fp => ({
            fullpath: fp,
            name: path.basename(fp),
            extension: path.extname(fp).toLowerCase().slice(1)
        }));
        
        indexingState.totalFiles = allFiles.length;
        indexingState.status = 'indexing';
        console.log(`[Indexer] Processing ${allFiles.length} files`);

        await new Promise((resolve, reject) => {
            db.run('BEGIN TRANSACTION', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
            if (localToken.cancelled) {
                console.log(`[Indexer] Indexing for ${folder} was cancelled.`);
                await new Promise((resolve) => db.run('ROLLBACK', resolve));
                await new Promise((resolve) => db.close(resolve));
                return;
            }
            
            const batch = allFiles.slice(i, i + BATCH_SIZE);
            const promises = batch.map(file => indexFile(db, file));
            await Promise.all(promises);
            indexingState.indexedCount += batch.length;
            console.log(`[Indexer] Processed ${indexingState.indexedCount}/${allFiles.length} files`);
        }
        
        await new Promise((resolve, reject) => {
            db.run('COMMIT', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        await new Promise((resolve) => db.close(resolve));
        console.log(`[Indexer] Successfully indexed ${allFiles.length} files in ${folder}`);
        
    } catch (err) {
        console.error(`Error indexing folder ${folder}:`, err.message);
        console.error(err.stack);
        indexingState.status = 'error';
    } finally {
        if (indexingState.status !== 'error') {
            indexingState.status = 'complete';
        }
        
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
    console.log(`[Indexer] Searching in database: ${dbPath} for query: "${query}"`);
    
    // Check if database file exists
    if (!fs.existsSync(dbPath)) {
        console.log(`[Indexer] Database not found: ${dbPath}`);
        return Promise.resolve([]);
    }
    
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) {
            console.error('Error opening database:', err);
        }
    });
    
    return new Promise((resolve, reject) => {
        let searchQuery = query.trim();
        if (!searchQuery) {
            db.close();
            return resolve([]);
        }
        
        // Parse quoted phrases and individual terms
        const quotedPhrases = [];
        const individualTerms = [];
        
        // Extract quoted phrases (both single and double quotes)
        const quoteRegex = /["']([^"']*)["']/g;
        let match;
        let processedQuery = searchQuery;
        
        while ((match = quoteRegex.exec(searchQuery)) !== null) {
            const phrase = match[1].trim();
            if (phrase) {
                quotedPhrases.push(phrase);
                // Remove the quoted phrase from the query for individual term processing
                processedQuery = processedQuery.replace(match[0], ' ');
            }
        }
        
        // Extract individual terms from remaining query
        const remainingTerms = processedQuery.trim().split(/\s+/).filter(term => term.length > 0);
        individualTerms.push(...remainingTerms);
        
        console.log(`[Indexer] Parsed query - Phrases: [${quotedPhrases.join(', ')}], Individual terms: [${individualTerms.join(', ')}]`);
        
        // Store the original query components for strict validation
        const originalPhrases = quotedPhrases.map(p => p.toLowerCase());
        const originalTerms = individualTerms.map(t => t.toLowerCase());
        
        // Check if content table exists first
        db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='content'", (err, row) => {
            if (err) {
                db.close();
                return reject(err);
            }
            
            if (!row) {
                console.log('No content table found - database may not be indexed yet');
                db.close();
                return resolve([]);
            }
            
            // Check if files table has fullpath column
            db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='files'", (err, filesTableInfo) => {
                if (err) {
                    db.close();
                    return reject(err);
                }
                
                if (!filesTableInfo || !filesTableInfo.sql.includes('fullpath')) {
                    console.log('Files table missing fullpath column - database needs to be re-indexed');
                    db.close();
                    return resolve([]);
                }
                
                // Check if it's an FTS table
                db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='content'", (err, tableInfo) => {
                    if (err) {
                        db.close();
                        return reject(err);
                    }
                    
                    const isFTS = tableInfo.sql.includes('VIRTUAL TABLE') && tableInfo.sql.includes('fts5');
                    
                    let sql;
                    let params;
                    
                    if (isFTS) {
                        // Build FTS query combining phrases and individual terms
                        let ftsQueryParts = [];
                        
                        // Add quoted phrases as exact matches
                        quotedPhrases.forEach(phrase => {
                            ftsQueryParts.push(`"${phrase}"`);
                        });
                        
                        // Add individual terms
                        individualTerms.forEach(term => {
                            ftsQueryParts.push(term);
                        });
                        
                        const ftsQuery = ftsQueryParts.join(' AND ');
                        
                        sql = `
                            SELECT f.*, results.priority, results.rank FROM (
                                SELECT fullpath, 1 AS priority, rank FROM content 
                                WHERE filename MATCH ? AND filename IS NOT NULL
                                UNION ALL
                                SELECT fullpath, 2 AS priority, rank FROM content 
                                WHERE filepath MATCH ? AND filepath IS NOT NULL
                                UNION ALL
                                SELECT fullpath, 3 AS priority, rank FROM content 
                                WHERE filecontent MATCH ? AND filecontent IS NOT NULL AND filecontent != ''
                            ) AS results
                            JOIN files f ON f.fullpath = results.fullpath
                            GROUP BY f.fullpath
                            ORDER BY MIN(results.priority) ASC, results.rank DESC LIMIT 100;
                        `;
                        params = [ftsQuery, ftsQuery, ftsQuery];
                    } else {
                        // For non-FTS, combine all terms with LIKE
                        const allTerms = [...quotedPhrases, ...individualTerms];
                        const likeQuery = `%${allTerms.join('%')}%`;
                        
                        sql = `
                            SELECT f.*, results.priority FROM (
                                SELECT fullpath, 1 AS priority FROM content 
                                WHERE LOWER(filename) LIKE LOWER(?) AND filename IS NOT NULL
                                UNION ALL
                                SELECT fullpath, 2 AS priority FROM content 
                                WHERE LOWER(filepath) LIKE LOWER(?) AND filepath IS NOT NULL
                                UNION ALL
                                SELECT fullpath, 3 AS priority FROM content 
                                WHERE LOWER(filecontent) LIKE LOWER(?) AND filecontent IS NOT NULL AND filecontent != ''
                            ) AS results
                            JOIN files f ON f.fullpath = results.fullpath
                            GROUP BY f.fullpath
                            ORDER BY MIN(results.priority) ASC LIMIT 100;
                        `;
                        params = [likeQuery, likeQuery, likeQuery];
                    }
                    
                    console.log(`[Indexer] Executing search query with phrases and terms`);
                    
                    db.all(sql, params, (err, rows) => {
                        if (err) {
                            console.error('Search query error:', err);
                            db.close();
                            return reject(err);
                        }
                        
                        console.log(`[Indexer] Initial query returned ${rows.length} rows`);
                        
                        // Get additional content info to validate matches
                        if (rows.length === 0) {
                            db.close();
                            return resolve([]);
                        }
                        
                        // Get the content data to verify actual matches
                        const fullpaths = rows.map(row => row.fullpath);
                        const placeholders = fullpaths.map(() => '?').join(',');
                        const contentSql = `SELECT fullpath, filename, filepath, filecontent FROM content WHERE fullpath IN (${placeholders})`;
                        
                        db.all(contentSql, fullpaths, (contentErr, contentRows) => {
                            db.close();
                            
                            if (contentErr) {
                                console.error('Error fetching content for validation:', contentErr);
                                return reject(contentErr);
                            }
                            
                            // Create a map for quick content lookup
                            const contentMap = new Map();
                            contentRows.forEach(content => {
                                contentMap.set(content.fullpath, content);
                            });
                            
                            // Validate each result with STRICT matching including phrase validation
                            const validatedResults = rows.filter(row => {
                                const content = contentMap.get(row.fullpath);
                                if (!content) {
                                    console.log(`[Indexer] No content found for: ${row.name}`);
                                    return false;
                                }
                                
                                // Strict validation - check phrases and individual terms
                                const filenameText = (content.filename || '').toLowerCase();
                                const filepathText = (content.filepath || '').toLowerCase();
                                const filecontentText = (content.filecontent || '').toLowerCase();
                                
                                // Check if all quoted phrases are present
                                const phraseMatches = originalPhrases.every(phrase => {
                                    return filenameText.includes(phrase) || 
                                           filepathText.includes(phrase) || 
                                           filecontentText.includes(phrase);
                                });
                                
                                // Check if all individual terms are present
                                const termMatches = originalTerms.every(term => {
                                    return filenameText.includes(term) || 
                                           filepathText.includes(term) || 
                                           filecontentText.includes(term);
                                });
                                
                                const hasValidMatch = phraseMatches && termMatches;
                                
                                if (!hasValidMatch) {
                                    console.log(`[Indexer] STRICT FILTER: Rejecting file "${row.name}" - missing required phrases or terms`);
                                }
                                
                                return hasValidMatch;
                            });
                            
                            const results = validatedResults.map(row => ({
                                id: Buffer.from(row.fullpath).toString('base64'),
                                name: row.name,
                                path: row.fullpath,
                                extension: row.extension,
                                size: row.size,
                                modified: new Date(row.mtime * 1000).toISOString()
                            }));
                            
                            console.log(`[Indexer] FINAL: Found ${results.length} validated search results (filtered from ${rows.length}) for query "${query}"`);
                            resolve(results);
                        });
                    });
                });
            });
        });
    });
}

// Real-time update functions for file watcher
async function addFileToIndex(folderPath, filePath) {
    try {
        console.log(`[Indexer] Adding file to index: ${filePath}`);
        const db = await initDb(folderPath);
        
        const file = {
            fullpath: filePath,
            name: path.basename(filePath),
            extension: path.extname(filePath).toLowerCase().slice(1)
        };
        
        await indexFile(db, file);
        
        await new Promise((resolve) => db.close(resolve));
        console.log(`[Indexer] Successfully added ${file.name} to index`);
    } catch (error) {
        console.error(`[Indexer] Error adding file ${filePath}:`, error.message);
    }
}

async function removeFileFromIndex(folderPath, filePath) {
    try {
        console.log(`[Indexer] Removing file from index: ${filePath}`);
        const db = await initDb(folderPath);
        
        await new Promise((resolve, reject) => {
            db.run('DELETE FROM files WHERE fullpath = ?', [filePath], function(err) {
                if (err) return reject(err);
                console.log(`[Indexer] Removed ${this.changes} file record(s)`);
                resolve();
            });
        });
        
        await new Promise((resolve, reject) => {
            db.run('DELETE FROM content WHERE fullpath = ?', [filePath], function(err) {
                if (err) return reject(err);
                console.log(`[Indexer] Removed ${this.changes} content record(s)`);
                resolve();
            });
        });
        
        await new Promise((resolve) => db.close(resolve));
        console.log(`[Indexer] Successfully removed ${path.basename(filePath)} from index`);
    } catch (error) {
        console.error(`[Indexer] Error removing file ${filePath}:`, error.message);
    }
}

async function updateFileInIndex(folderPath, filePath) {
    // For modifications, we treat it as add/replace
    await addFileToIndex(folderPath, filePath);
}

async function cleanupStaleEntries(folderPath) {
    try {
        console.log(`[Indexer] Cleaning up stale entries for: ${folderPath}`);
        const db = await initDb(folderPath);
        
        // Get all file paths from database
        const dbFiles = await new Promise((resolve, reject) => {
            db.all('SELECT fullpath FROM files', (err, rows) => {
                if (err) return reject(err);
                resolve(rows.map(row => row.fullpath));
            });
        });
        
        let removedCount = 0;
        for (const dbFilePath of dbFiles) {
            try {
                await fs.promises.access(dbFilePath);
            } catch {
                // File doesn't exist, remove from index
                await new Promise((resolve) => {
                    db.run('DELETE FROM files WHERE fullpath = ?', [dbFilePath], resolve);
                });
                await new Promise((resolve) => {
                    db.run('DELETE FROM content WHERE fullpath = ?', [dbFilePath], resolve);
                });
                removedCount++;
                console.log(`[Indexer] Cleaned up stale entry: ${path.basename(dbFilePath)}`);
            }
        }
        
        await new Promise((resolve) => db.close(resolve));
        console.log(`[Indexer] Cleanup complete - removed ${removedCount} stale entries`);
    } catch (error) {
        console.error(`[Indexer] Error during cleanup of ${folderPath}:`, error.message);
    }
}

function getWatchedFolders() {
    return Array.from(watchedFolders);
}

function cancelCurrentIndexing() {
    if (currentIndexingToken) {
        console.log('[Indexer] Cancelling current indexing operation');
        currentIndexingToken.cancelled = true;
    }
}

module.exports = {
    indexFolder,
    searchContent,
    getIndexingStatus: (folder) => activeIndexingProcesses.get(folder) || { status: 'idle' },
    cancelCurrentIndexing,
    // New real-time update functions
    addFileToIndex,
    removeFileFromIndex,
    updateFileInIndex,
    cleanupStaleEntries,
    getWatchedFolders
};