# File Searcher 🔍

A lightning-fast desktop file search application with full-text content indexing, real-time search, and intelligent preview capabilities. Built with Node.js and SQLite FTS5 for enterprise-grade performance.

## 🚀 Features

### Core Search Capabilities
- **⚡ Lightning-fast search** across file names, paths, and content using SQLite FTS5
- **🔄 Real-time index updates** - Automatically detects file changes, moves, and deletions
- **🔍 Phrase search support** - Use quotes for exact phrase matching: `"Retail Merchandising"`
- **📁 Smart directory targeting** with OneDrive integration
- **🏷️ File type filtering** (Documents, Images, Text/Code, Archives)
- **🎯 Real-time search** with intelligent debouncing (300ms)
- **📊 Search result ranking** by relevance (filename > path > content)

### Advanced Search Features
- **Phrase Search**: `"exact phrase"` or `'exact phrase'` for precise matching
- **Multi-term Search**: `document analysis report` (all terms must be present)
- **Mixed Search**: `"customer service" training best` (phrase + individual terms)
- **Path-aware Search**: Searches file paths, names, and content simultaneously

### File Content Support
- **📄 Documents**: PDF, DOCX (with formatting), XLSX (with tables), PPTX, TXT, MD
- **💻 Code/Text**: JS, TS, HTML, CSS, Python, Java, JSON, XML, CSV
- **🖼️ Images**: JPG, PNG, GIF, BMP, WebP, SVG (metadata indexing)
- **📦 Archives**: ZIP, RAR, 7Z, TAR, GZ (filename indexing)
- **🎨 Design Files**: PSD (metadata extraction)

### Intelligent Preview System
- **📖 Content preview** with search term highlighting
- **🎯 Auto-scroll** to first match in document content
- **⬅️➡️ Match navigation** - Next/previous buttons and keyboard shortcuts to navigate between highlighted matches
- **🔢 Match counter** - Shows current match position (e.g., "2 / 5")
- **🎨 Formatted previews** - Preserves DOCX formatting and XLSX table structure
- **🔗 Path highlighting** - Visual indication of folder matches
- **📍 Match indicators** - Shows why files matched (filename, path, or content)

### Real-Time File Monitoring 🔄
- **⚡ Instant updates** - Files added, modified, or deleted are automatically indexed
- **📊 Live status indicator** - Green dot shows when auto-update is active
- **🛡️ Smart resource management** - Conservative limits (max 5 folders, 2-second debounce)
- **💻 Cross-platform watching** - Uses chokidar for reliable file system monitoring
- **🚀 Zero-configuration** - Automatically starts watching after indexing
- **🔄 Move detection** - Handles files moved between indexed folders
- **🧹 Automatic cleanup** - Removes stale entries when files are deleted
- **🚫 Smart exclusions** - Ignores log files, temporary files, and system directories to prevent feedback loops
- **⚡ Queued operations** - File watcher updates are queued to prevent database conflicts

## 🏗️ Architecture Overview

### System Design
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │   Database      │
│   (Browser)     │◄──►│   (Express)     │◄──►│   (SQLite)      │
│                 │    │                 │    │                 │
│ • script.js     │    │ • server.cjs    │    │ • FTS5 Search   │
│ • styles.css    │    │ • indexer.cjs   │    │ • File Metadata │
│ • index.html    │    │ • previewer.js  │    │ • Content Index │
│                 │    │ • watcher.cjs   │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              ▲
                              │ Real-time
                              │ File Events
                              ▼
                    ┌─────────────────┐
                    │ File System     │
                    │ (Chokidar)      │
                    │                 │
                    │ • File Changes  │
                    │ • Move Events   │
                    │ • Deletions     │
                    └─────────────────┘
```

### Component Breakdown

#### Backend Components
1. **server.cjs** - Main Express server
   - API endpoints for search, preview, indexing
   - OneDrive path resolution
   - File serving and security
   - Real-time update coordination

2. **indexer.cjs** - Core indexing engine
   - SQLite FTS5 database management
   - Batch file processing with progress tracking
   - Content extraction from various file types
   - Search query processing and phrase handling
   - Real-time file add/remove/update operations

3. **watcher.cjs** - File system monitoring (NEW)
   - Real-time file change detection using chokidar
   - Debounced event processing
   - Multi-folder watching with resource limits
   - Cross-platform file system event handling

4. **previewer.js** - File preview generator
   - Content extraction for preview
   - Format-specific rendering (HTML for DOCX, tables for XLSX)
   - Error handling and timeout management

#### Frontend Components
1. **script.js** - Main application logic
   - Search interface management
   - Real-time search with request deduplication
   - Modal preview system with highlighting
   - Indexing progress tracking

2. **styles.css** - Modern responsive design
   - Clean, professional interface
   - Consistent visual styling
   - Responsive layout support

3. **index.html** - Application structure
   - Semantic HTML structure
   - Accessibility features
   - Modal system foundation

## 🔄 How Search Works - Complete Workflow

### Example: User searches for `"customer service" training`

#### 1. **User Input Processing** (Frontend)
```javascript
// User types in search box
Input: "customer service" training
↓
// Query parsing (300ms debounce)
Parsed: {
  phrases: ["customer service"],
  terms: ["training"]
}
```

#### 2. **API Request** (Frontend → Backend)
```http
GET /api/search?query="customer service" training&directory=documents&fileType=all
```

#### 3. **Query Processing** (Backend - indexer.cjs)
```javascript
// Query decomposition
quotedPhrases: ["customer service"]
individualTerms: ["training"]

// FTS5 query construction
ftsQuery: "customer service" AND training

// Database search across three priorities:
1. filename MATCH query     (Priority 1 - highest)
2. filepath MATCH query     (Priority 2 - medium)  
3. filecontent MATCH query  (Priority 3 - lowest)
```

#### 4. **Database Search** (SQLite FTS5)
```sql
SELECT f.*, results.priority, results.rank FROM (
    SELECT fullpath, 1 AS priority, rank FROM content 
    WHERE filename MATCH '"customer service" AND training'
    UNION ALL
    SELECT fullpath, 2 AS priority, rank FROM content 
    WHERE filepath MATCH '"customer service" AND training'
    UNION ALL  
    SELECT fullpath, 3 AS priority, rank FROM content 
    WHERE filecontent MATCH '"customer service" AND training'
) AS results
JOIN files f ON f.fullpath = results.fullpath
ORDER BY MIN(priority) ASC, rank DESC
```

#### 5. **Result Validation** (Backend)
```javascript
// Strict validation ensures both phrase and terms are present
validatedResults = results.filter(row => {
    const content = getFileContent(row.fullpath);
    
    // Must contain EXACT phrase "customer service"
    const hasPhrase = content.toLowerCase().includes("customer service");
    
    // Must contain individual term "training"
    const hasTerm = content.toLowerCase().includes("training");
    
    return hasPhrase && hasTerm;
});
```

#### 6. **Response Formation** (Backend → Frontend)
```json
{
  "success": true,
  "files": [
    {
      "id": "base64-encoded-path",
      "name": "Customer Service Training Manual.docx",
      "path": "C:/Documents/HR/Customer Service Training Manual.docx",
      "extension": "docx",
      "size": 2048576,
      "modified": "2024-12-20T10:30:00.000Z"
    }
  ]
}
```

#### 7. **Results Display** (Frontend)
```javascript
// Format and display results
displayResults(results) {
    // Create table rows with formatted dates (dd-mon-yyyy hh:mi AM/PM)
    // Add Preview and Open buttons
    // Show search statistics (count, time)
    // Apply file type icons
}
```

#### 8. **Preview Generation** (When user clicks Preview)
```javascript
// Frontend requests preview
GET /api/preview/base64-encoded-file-path

// Backend extracts content with formatting
previewFile() → { type: 'html', content: formattedContent }

// Frontend displays with highlighting and navigation
showPreview() {
    // Highlight "customer service" phrase in yellow
    // Highlight "training" terms in yellow
    // Initialize match navigation (find all matches, show counter)
    // Auto-scroll to first match with enhanced highlighting
    // Enable keyboard navigation (arrow keys)
    // Show match statistics and navigation controls
}
```

## 📁 File Structure
```
file-searcher/
├── public/                 # Frontend assets
│   ├── index.html         # Main HTML structure
│   ├── script.js          # Application logic (FileSearcher class)
│   └── styles.css         # Modern responsive styling
├── .indexes/              # SQLite databases (auto-created)
│   └── {md5-hash}.db      # Per-directory database files
├── server.cjs             # Express server & API endpoints
├── indexer.cjs            # File indexing engine with FTS5
├── watcher.cjs            # Real-time file system monitoring (NEW)
├── previewer.js           # File preview generator
├── install-watcher.bat    # Easy dependency installation (NEW)
├── package.json           # Dependencies and scripts
├── package-lock.json      # Dependency lock file
└── README.md              # This documentation
```

## 🛠️ Installation & Setup

### Prerequisites
- **Node.js** v16.0.0 or higher
- **npm** (comes with Node.js)
- **Windows/macOS/Linux** support

### Quick Start
```bash
# Clone or download the project
cd file-searcher

# Install dependencies (including chokidar for real-time updates)
npm install

# OR use the convenient installer (Windows)
# install-watcher.bat

# Start the application
npm start

# For development (auto-restart on changes)
npm run dev
```

The application will:
1. Start on `http://localhost:3001`
2. Automatically open in your default browser
3. Begin indexing your current directory
4. **NEW**: Start real-time file monitoring after indexing completes

### Dependencies
```json
{
  "express": "^4.19.2",      # Web server framework
  "sqlite3": "^5.1.7",      # Database with FTS5 support
  "chokidar": "^3.5.3",     # File system watcher
  "mammoth": "^1.7.0",      # DOCX content extraction
  "exceljs": "^4.4.0",      # XLSX processing
  "pdf-parse": "^1.1.1",    # PDF text extraction
  "jszip": "^3.10.1",       # ZIP file handling
  "xlsx": "^0.18.5",        # Excel file compatibility
  "open": "^8.4.2",         # Cross-platform file opening
  "psd": "^3.4.0"           # Photoshop file support
}
```

## 📂 Directory Support & OneDrive Integration

### Smart Directory Resolution
The application automatically detects and prioritizes OneDrive locations:

1. **OneDrive Business**: `process.env.OneDriveCommercial` or `OneDrive-Commercial`
2. **OneDrive Personal**: `process.env.OneDriveConsumer` or `OneDrive`
3. **Fallback**: System home directory

### Available Quick Paths
- **📁 Current Directory**: Application's working directory
- **🏠 Home Directory**: User's home folder (OneDrive if available)
- **🖥️ Desktop**: Desktop folder
- **📄 Documents**: Documents folder  
- **⬇️ Downloads**: Downloads folder
- **📂 Custom Path**: Any directory path (supports drag & drop)

## 🎨 User Interface Features

### Modern Design Elements
- **Gradient Background**: Professional blue-to-purple gradient
- **Card-based Layout**: Clean container with subtle shadows
- **Consistent Button Styling**: Grey outlines for visual consistency
- **Responsive Design**: Adapts to different screen sizes
- **Accessibility**: Semantic HTML and keyboard navigation

### Match Navigation in Preview
- **Visual Navigation Controls**: Sleek next/previous buttons with hover effects
- **Real-time Match Counter**: Shows current position like "3 / 7" 
- **Enhanced Current Match**: Orange border and glow effect for active match
- **Keyboard Shortcuts**: 
  - `↑` or `←` - Previous match
  - `↓` or `→` - Next match
  - `Esc` - Close preview
- **Circular Navigation**: Seamlessly loops from last to first match
- **Smooth Scrolling**: Animated transitions with temporary highlight effects
- **Smart Visibility**: Navigation controls only appear when matches are found

### Search Interface
- **Real-time Search**: 300ms debounced input for optimal performance
- **Visual Feedback**: Loading states and progress indicators
- **Cancel Button**: Easy search clearing with consistent styling
- **File Type Filters**: Dropdown for targeted searches

### Results Display
- **Sortable Table**: Name, type, size, modified date (dd-mon-yyyy hh:mi AM/PM)
- **File Icons**: Visual file type identification
- **Action Buttons**: Preview and Open with hover effects
- **Alternating Rows**: Enhanced readability

### Preview Modal
- **Rich Content Display**: Formatted DOCX, Excel tables, syntax highlighting
- **Search Highlighting**: Yellow highlighting for matched terms with enhanced current match styling
- **Match Navigation**: Next/previous buttons with match counter ("1 / 3") and keyboard support
- **Keyboard Shortcuts**: Use arrow keys (↑↓←→) to navigate between matches
- **Path Display**: Full file path with folder match highlighting
- **Smart Scrolling**: Auto-scroll to matches with smooth animation and temporary highlighting
- **Match Statistics**: Clear indication of why files matched

## ⚙️ Configuration Options

### Performance Tuning
```javascript
// indexer.cjs - Batch processing
const BATCH_SIZE = 100;              // Files per batch (100-500 recommended)
const FILE_PROCESSING_TIMEOUT_MS = 15000;  // Per-file timeout

// server.cjs - Server settings  
const PORT = process.env.PORT || 3001;     // Server port

// script.js - Frontend settings
const SEARCH_DEBOUNCE = 300;               // Search delay (ms)
```

### File Type Filters
```javascript
// Add custom file type categories in server.cjs
case 'custom':
    return ['ext1', 'ext2', 'ext3'].includes(ext);
```

### Indexing Exclusions
```javascript
// Automatically excluded directories:
- .git, .indexes, node_modules
- Hidden folders (starting with .)
- System directories
```

## 🔧 Advanced Usage

### Database Management
- **Location**: `.indexes/` directory
- **Format**: SQLite with FTS5 extension
- **Naming**: MD5 hash of directory path
- **Schema**: Auto-updating with backward compatibility

### Search Optimization Tips
1. **Phrase searches** are most accurate: `"exact phrase"`
2. **Combine techniques**: `"project plan" 2024 budget`
3. **Use file type filters** for faster results
4. **Shorter terms** often yield better results

### Preview Navigation Tips
1. **Use keyboard shortcuts** for faster navigation: Arrow keys work in any direction
2. **Watch the match counter** to see your progress through search results
3. **Current match highlighting** makes it easy to see exactly where you are
4. **Circular navigation** means you never reach a "dead end" - keep pressing next to cycle through all matches

### Troubleshooting

#### Common Issues
| Issue | Solution |
|-------|----------|
| Preview not working | Check file permissions and supported formats |
| Slow indexing | Reduce `BATCH_SIZE` or exclude large directories |
| OneDrive not detected | Verify environment variables are set |
| Search results missing | Re-index by changing directory and back |
| Database errors | Delete `.indexes/` folder to rebuild |

#### Debug Information
The application provides extensive logging:
- **Indexing**: Progress, errors, completion status
- **Search**: Query parsing, FTS operations, result validation  
- **Preview**: Content extraction, formatting, errors
- **Server**: Request/response cycles, directory resolution

## 🚀 Performance Characteristics & Pre-warming System

### Advanced Database Pre-warming 🔥
The application features a sophisticated **multi-layered pre-warming system** that dramatically reduces first-time search latency from seconds to milliseconds:

#### 1. **Startup Background Pre-warming**
- **Automatic**: Runs 5 seconds after server startup
- **Intelligent**: Only pre-warms existing databases (no unnecessary indexing)
- **Parallel**: Simultaneously warms multiple common directories:
  - Current working directory
  - User home directory  
  - Documents folder
  - Desktop folder
- **Smart Detection**: Uses OneDrive integration for optimal path resolution

#### 2. **Progressive Early Warming**
- **Triggered**: After 200 files are indexed (during indexing process)
- **Non-blocking**: Runs in background without affecting indexing speed
- **Retry Logic**: Waits for sufficient database content before warming
- **Performance**: Enables ultra-fast searches even before indexing completes

#### 3. **Completion Warming**
- **Immediate**: Activates 100ms after indexing completes
- **Connection Pooling**: Maintains persistent database connections
- **Schema Validation**: Pre-validates database structure for instant access

#### 4. **Database Concurrency Control**
- **Operation Queuing**: Prevents `SQLITE_BUSY` errors through serialized access
- **Connection Management**: Smart reuse of warmed connections
- **Conflict Resolution**: File watcher operations queue behind searches

### Search Performance
- **First-time search**: ~2-3 seconds (with early warming)
- **Subsequent searches**: **50-200ms** with pre-warmed connections
- **⚡ Ultra-fast mode**: Sub-50ms for prewarmed databases
- **Large databases**: Scales to millions of files with consistent performance
- **Memory efficiency**: Persistent connections with minimal RAM footprint

#### Performance Comparison
| Scenario | Before Pre-warming | After Pre-warming | Improvement |
|----------|-------------------|------------------|-------------|
| **First search** | 15+ seconds | ~2-3 seconds | **80% faster** |
| **Subsequent searches** | 2-5 seconds | 50-200ms | **90% faster** |
| **Large folders (2000+ files)** | 10+ seconds | <1 second | **95% faster** |
| **Pre-warmed databases** | N/A | <50ms | **⚡ Ultra-fast** |

### Technical Implementation
```javascript
// Connection pooling with validation
const warmedConnections = new Map(); // Persistent connections
const dbOperationQueues = new Map(); // Concurrency control

// Early warming trigger
if (indexedCount >= 200 && indexedCount < 300) {
    setTimeout(() => prewarmDatabase(folder), 500);
}

// Smart connection reuse
if (warmedData && warmedData.schemaValidated) {
    console.log('⚡ Using PREWARMED database connection');
    db = warmedData.db; // Reuse existing connection
}
```

### Indexing Performance
- **Speed**: ~500-1000 files per minute (content extraction dependent)
- **Storage**: ~1-5MB database per 10,000 indexed files
- **Incremental**: Only re-indexes changed files (mtime comparison)

### Browser Support
- **Modern browsers**: Chrome, Firefox, Safari, Edge (ES2018+)
- **Features used**: Fetch API, Promises, Modern CSS Grid
- **No external dependencies**: Self-contained application

## 🤝 Development & Extension

### Adding File Type Support
1. **Indexing**: Update `extractContent()` in `indexer.cjs`
2. **Preview**: Update `previewFile()` in `previewer.js`  
3. **Filtering**: Add extension to `server.cjs` filters
4. **Icons**: Add file type icon in `script.js`

### API Extension
```javascript
// Add new endpoints in server.cjs
app.get('/api/custom-endpoint', (req, res) => {
    // Custom functionality
});
```

### UI Customization
- **Colors**: Modify CSS variables in `styles.css`
- **Layout**: Update HTML structure in `index.html`
- **Behavior**: Extend `FileSearcher` class in `script.js`

## 📊 Technical Specifications

### Database Schema
```sql
-- Files table
CREATE TABLE files (
    id INTEGER PRIMARY KEY,
    name TEXT,
    fullpath TEXT UNIQUE,
    extension TEXT,
    mtime INTEGER,
    size INTEGER
);

-- FTS5 content table
CREATE VIRTUAL TABLE content USING fts5(
    fullpath UNINDEXED,
    filename,
    filepath, 
    filecontent,
    tokenize = 'porter ascii'
);
```

### API Endpoints
- `GET /api/search` - Perform file search with query parameters
- `GET /api/preview/:fileId` - Generate file preview (Base64 file ID)
- `GET /api/file-content/:fileId` - Serve raw file content
- `POST /api/open-file` - Open file in system default application
- `POST /api/index` - Initiate directory indexing
- `GET /api/index/status` - Get indexing progress status
- `POST /api/index/cleanup` - Clean up stale index entries
- `GET /api/resolve-directory` - Resolve directory shortcuts
- `POST /api/watcher/start` - Start file system monitoring for a folder
- `POST /api/watcher/stop` - Stop file system monitoring for a folder
- `GET /api/watcher/status` - Get current watching status for all folders

## 📝 License

This project is provided as-is for educational and personal use. Feel free to modify and distribute according to your needs.

---

**Created with ❤️ for fast, efficient file searching**

*For support or questions, check the console logs for detailed debugging information.*