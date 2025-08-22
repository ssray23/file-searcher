const express = require('express');
const path = require('path');
const open = require('open');
const os = require('os');
const fs = require('fs').promises;
const indexer = require('./indexer.cjs');
const { previewFile } = require('./previewer.js');

const PORT = process.env.PORT || 3001;
const app = express();

app.use(express.json());

// --- *** THE FINAL, CORRECTED, NO-LIBRARY FOLDER RESOLVER *** ---
function resolveDirectory(directory) {
    if (!directory || directory === 'current') return process.cwd();

    // This robust method works for standard and OneDrive-managed folders.
    const homedir = os.homedir();
    
    // 1. Check for OneDrive for Business environment variables first.
    const oneDriveCommercial = process.env.OneDriveCommercial || process.env['OneDrive-Commercial'];
    // 2. Then check for personal OneDrive.
    const oneDrivePersonal = process.env.OneDriveConsumer || process.env.OneDrive;
    // 3. Determine the correct base path.
    const basePath = oneDriveCommercial || oneDrivePersonal || homedir;

    const specialDirs = {
        'home': homedir, // Home is always the user profile
        'desktop': path.join(basePath, 'Desktop'),
        'documents': path.join(basePath, 'Documents'),
        'downloads': path.join(basePath, 'Downloads')
    };

    if (specialDirs[directory]) {
        console.log(`[RESOLVER] Resolved '${directory}' to '${specialDirs[directory]}'`);
        return specialDirs[directory];
    }
    
    if (path.isAbsolute(directory)) return directory;
    return path.resolve(directory);
}
// --- *** END OF FIX *** ---

// --- API Endpoints ---
app.get('/api/search', async (req, res) => {
    try {
        const { query, directory } = req.query;
        if (!query) return res.json({ success: true, files: [] });
        const folder = resolveDirectory(directory);
        const results = await indexer.searchContent(folder, query);
        res.json({ success: true, files: results });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/open-file', async (req, res) => {
    const { filePath } = req.body;
    if (!filePath) {
        return res.status(400).json({ success: false, error: 'File path is required.' });
    }
    try {
        await open(filePath);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to open file.' });
    }
});

app.get('/api/preview/:fileId', async (req, res) => {
    try {
        const filePath = Buffer.from(req.params.fileId, 'base64').toString();
        const ext = path.extname(filePath).toLowerCase();
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];

        if (imageExtensions.includes(ext)) {
            const imageUrl = `/api/file-content/${req.params.fileId}`;
            res.json({ success: true, type: 'image', content: imageUrl });
        } else {
            const content = await previewFile(filePath);
            const contentType = ['.docx', '.xlsx'].includes(ext) ? 'html' : 'text';
            res.json({ success: true, type: contentType, content });
        }
    } catch (err) {
        console.error(`Preview error for file ID ${req.params.fileId}:`, err);
        res.status(500).json({ success: false, error: err.message || 'Could not generate preview.' });
    }
});

app.get('/api/file-content/:fileId', (req, res) => {
    try {
        const filePath = Buffer.from(req.params.fileId, 'base64').toString();
        res.sendFile(filePath);
    } catch (err) {
        res.status(404).json({ success: false, error: 'File not found.' });
    }
});

app.post('/api/index', (req, res) => {
    const { directory } = req.query;
    const folder = resolveDirectory(directory);
    indexer.indexFolder(folder);
    res.json({ success: true, message: 'Indexing initiated.' });
});

app.get('/api/index/status', async (req, res) => {
    const { directory } = req.query;
    const folder = resolveDirectory(directory);
    const isReady = await indexer.isIndexAvailable(folder);
    const status = indexer.getIndexingStatus(folder);
    res.json({ success: true, isReady, status });
});

app.get('/api/resolve-directory', async (req, res) => {
    const { directory } = req.query;
    const resolvedPath = resolveDirectory(directory);
    res.json({ success: true, path: resolvedPath });
});

// --- Static File Serving ---
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`File Searcher server running on http://localhost:${PORT}`);
});