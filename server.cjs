const express = require('express');
const path = require('path');
const open = require('open');
const os = require('os');
const indexer = require('./indexer.cjs');
const { previewFile } = require('./previewer.js');

const PORT = process.env.PORT || 3001;
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add logging middleware
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

function resolveDirectory(directory) {
    if (!directory || directory === 'current') return process.cwd();
    const homedir = os.homedir();
    const oneDriveCommercial = process.env.OneDriveCommercial || process.env['OneDrive-Commercial'];
    const oneDrivePersonal = process.env.OneDriveConsumer || process.env.OneDrive;
    const basePath = oneDriveCommercial || oneDrivePersonal || homedir;
    const specialDirs = {
        'home': homedir,
        'desktop': path.join(basePath, 'Desktop'),
        'documents': path.join(basePath, 'Documents'),
        'downloads': path.join(homedir, 'Downloads')
    };
    if (specialDirs[directory]) {
        return specialDirs[directory];
    }
    if (path.isAbsolute(directory)) return directory;
    return path.resolve(directory);
}

// --- API Endpoints ---
// Replace the existing /api/search endpoint in server.cjs with this:

app.get('/api/search', async (req, res) => {
    try {
        console.log('Search request:', req.query);
        const { query, directory, fileType } = req.query;
        
        // Handle empty query with file type filter
        const searchQuery = query === '*' ? '' : query;
        
        if (!searchQuery && (!fileType || fileType === 'all')) {
            return res.json({ success: true, files: [] });
        }
        
        const folder = resolveDirectory(directory);
        console.log('Searching in folder:', folder);
        
        let results = await indexer.searchContent(folder, searchQuery);
        
        // Apply file type filtering on the server side
        if (fileType && fileType !== 'all') {
            results = results.filter(file => {
                const ext = file.extension?.toLowerCase() || '';
                switch (fileType) {
                    case 'documents':
                        return ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext);
                    case 'images':
                        return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'].includes(ext);
                    case 'text':
                        return ['txt', 'md', 'js', 'ts', 'html', 'css', 'py', 'java', 'json', 'xml', 'csv'].includes(ext);
                    case 'archives':
                        return ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext);
                    default:
                        return true;
                }
            });
        }
        
        res.json({ success: true, files: results });
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/open-file', async (req, res) => {
    try {
        const { filePath } = req.body;
        if (!filePath) {
            return res.status(400).json({ success: false, error: 'File path is required.' });
        }
        console.log('Opening file:', filePath);
        await open(filePath);
        res.json({ success: true });
    } catch (error) {
        console.error('Open file error:', error);
        res.status(500).json({ success: false, error: 'Failed to open file.' });
    }
});

// Replace the preview endpoint in server.cjs with this:

app.get('/api/preview/:fileId', async (req, res) => {
    try {
        console.log('Preview request for fileId:', req.params.fileId);
        
        let filePath;
        try {
            filePath = Buffer.from(req.params.fileId, 'base64').toString('utf8');
            console.log('Decoded file path:', filePath);
        } catch (decodeError) {
            console.error('Error decoding fileId:', decodeError);
            return res.status(400).json({ success: false, error: 'Invalid file ID' });
        }
        
        // Check if file exists
        const fs = require('fs');
        if (!fs.existsSync(filePath)) {
            console.error('File does not exist:', filePath);
            return res.status(404).json({ success: false, error: 'File not found' });
        }
        
        const ext = path.extname(filePath).toLowerCase();
        console.log('File extension:', ext);
        
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];

        if (imageExtensions.includes(ext)) {
            const imageUrl = `/api/file-content/${req.params.fileId}`;
            console.log('Serving image preview:', imageUrl);
            res.json({ success: true, type: 'image', content: imageUrl });
        } else {
            console.log('Generating text/document preview');
            const previewResult = await previewFile(filePath);
            
            console.log('Preview result type:', previewResult.type);
            console.log('Content length:', previewResult.content?.length || 0);
            
            // Use the type returned by the previewer instead of hardcoding
            res.json({ 
                success: true, 
                type: previewResult.type, // Use the actual type from previewer
                content: previewResult.content 
            });
        }
    } catch (err) {
        console.error(`Preview error for file ID ${req.params.fileId}:`, err);
        res.status(500).json({ 
            success: false, 
            error: err.message || 'Could not generate preview.' 
        });
    }
});

app.get('/api/file-content/:fileId', (req, res) => {
    try {
        console.log('File content request for fileId:', req.params.fileId);
        const filePath = Buffer.from(req.params.fileId, 'base64').toString();
        console.log('File content path:', filePath);
        res.sendFile(filePath);
    } catch (err) {
        console.error('File content error:', err);
        res.status(404).json({ success: false, error: 'File not found.' });
    }
});

app.post('/api/index', async (req, res) => {
    try {
        console.log('Index request received:', req.query);
        
        // Immediately cancel any job that might be running.
        indexer.cancelCurrentIndexing();

        // Start the new job.
        const { directory } = req.query;
        const folder = resolveDirectory(directory);
        console.log('Starting indexing for folder:', folder);
        
        // Start indexing (non-blocking)
        indexer.indexFolder(folder).catch(err => {
            console.error('Indexing error:', err);
        });
        
        res.json({ success: true, message: 'Indexing initiated.' });
    } catch (err) {
        console.error('Index endpoint error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/index/status', (req, res) => {
    try {
        console.log('Status request:', req.query);
        const { directory } = req.query;
        const folder = resolveDirectory(directory);
        const status = indexer.getIndexingStatus(folder);
        console.log('Status response:', status);
        res.json({ success: true, status });
    } catch (err) {
        console.error('Status error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/resolve-directory', (req, res) => {
    try {
        console.log('Resolve directory request:', req.query);
        const { directory } = req.query;
        const resolvedPath = resolveDirectory(directory);
        console.log('Resolved path:', resolvedPath);
        res.json({ success: true, path: resolvedPath });
    } catch (err) {
        console.error('Resolve directory error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- Static File Serving ---
app.use(express.static(path.join(__dirname, 'public')));

// Catch-all handler for client-side routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`File Searcher server running on http://localhost:${PORT}`);
    console.log(`Current working directory: ${process.cwd()}`);
    console.log(`Home directory: ${os.homedir()}`);
});