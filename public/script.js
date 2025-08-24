class FileSearcher {
    constructor() {
        // Core elements
        this.searchInput = document.getElementById('searchInput');
        this.cancelBtn = document.getElementById('cancelBtn');
        this.resultsSection = document.getElementById('resultsSection');
        this.resultsTableBody = document.getElementById('resultsTableBody');
        this.noResults = document.getElementById('noResults');
        this.resultCount = document.getElementById('resultCount');
        this.searchTime = document.getElementById('searchTime');
        this.folderSelect = document.getElementById('folderSelect');
        this.customPathInput = document.getElementById('customPathInput');
        this.pathValue = document.getElementById('pathValue');
        this.fileTypeFilter = document.getElementById('fileTypeFilter');

        // Indexing UI
        this.indexingProgressContainer = document.getElementById('indexingProgressContainer');
        this.indexingProgressBar = document.getElementById('indexingProgressBar');
        this.indexingStatusText = document.getElementById('indexingStatusText');

        // Preview Modal
        this.previewModal = document.getElementById('previewModal');
        this.modalTitle = document.getElementById('modalTitle');
        this.modalBody = document.getElementById('modalBody');
        this.closeModal = document.getElementById('closeModal');

        // State
        this.selectedDirectory = 'current';
        this.indexingPollInterval = null;
        this.currentSearchQuery = ''; // Store current search query for highlighting
        this.currentSearchController = null; // For aborting requests
        this.searchRequestId = 0; // For tracking request order

        this.initializeEventListeners();
        this.handleFolderChange({
            target: {
                value: 'current'
            }
        });
    }

    initializeEventListeners() {
        this.searchInput.addEventListener('input', () => this.handleSearchInput());
        this.fileTypeFilter.addEventListener('change', () => this.performSearch());
        this.cancelBtn.addEventListener('click', () => this.clearSearch());
        this.folderSelect.addEventListener('change', (e) => this.handleFolderChange(e));
        this.customPathInput.addEventListener('change', (e) => this.handleCustomPath(e));
        this.customPathInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleCustomPath(e);
        });
        this.closeModal.addEventListener('click', () => this.hideModal());
        this.previewModal.addEventListener('click', (e) => {
            if (e.target === this.previewModal) this.hideModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.hideModal();
        });
    }

    async handleFolderChange(e) {
        const value = e.target.value;
        if (value === 'custom') {
            this.customPathInput.style.display = 'inline-block';
            this.customPathInput.focus();
            return;
        }

        this.customPathInput.style.display = 'none';
        const newSelectedDirectory = value;

        if (newSelectedDirectory === this.selectedDirectory && e.type === 'change') {
            return;
        }

        this.selectedDirectory = newSelectedDirectory;
        this.hideResults();
        await this.updateCurrentPath();
        this.setSearchUIReady(false);
        this.initiateIndexing();
    }

    async handleCustomPath(e) {
        const path = e.target.value.trim();
        if (path && path !== this.selectedDirectory) {
            this.selectedDirectory = path;
            this.hideResults();
            await this.updateCurrentPath();
            this.setSearchUIReady(false);
            this.initiateIndexing();
        }
    }

    handleSearchInput() {
        // Clear existing timeout
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }
        
        // Abort any ongoing search request
        if (this.currentSearchController) {
            console.log('[Search] Aborting previous search request');
            this.currentSearchController.abort();
            this.currentSearchController = null;
        }
        
        // Set up new debounced search - increased to 300ms for better performance
        this.searchTimeout = setTimeout(() => this.performSearch(), 300);
    }

    async performSearch() {
        const query = this.searchInput.value.trim();
        const fileType = this.fileTypeFilter.value;
        
        // Increment request ID to track this specific search
        const currentRequestId = ++this.searchRequestId;
        
        this.currentSearchQuery = query; // Store for highlighting
        const startTime = performance.now();
        this.cancelBtn.style.display = query ? 'flex' : 'none';

        if (!query && fileType === 'all') {
            this.hideResults();
            return;
        }

        // Abort any existing request
        if (this.currentSearchController) {
            console.log('[Search] Aborting previous search request');
            this.currentSearchController.abort();
        }

        // Create new AbortController for this request
        this.currentSearchController = new AbortController();
        const { signal } = this.currentSearchController;

        try {
            console.log(`[Search] Starting search request #${currentRequestId} for query: "${query}"`);
            
            const params = new URLSearchParams({
                query: query || '*',
                directory: this.selectedDirectory,
                fileType
            });
            
            const response = await fetch(`/api/search?${params}`, { signal });
            
            // Check if this request is still the latest one
            if (currentRequestId !== this.searchRequestId) {
                console.log(`[Search] Discarding outdated response #${currentRequestId} (latest: #${this.searchRequestId})`);
                return;
            }
            
            if (signal.aborted) {
                console.log(`[Search] Request #${currentRequestId} was aborted`);
                return;
            }
            
            const data = await response.json();
            
            // Double-check we're still the latest request
            if (currentRequestId !== this.searchRequestId) {
                console.log(`[Search] Discarding outdated results #${currentRequestId} (latest: #${this.searchRequestId})`);
                return;
            }
            
            if (data.success) {
                console.log(`[Search] Displaying results for request #${currentRequestId}: ${data.files.length} files`);
                this.displayResults(data.files, Math.round(performance.now() - startTime));
            } else {
                console.error(`[Search] Search failed for request #${currentRequestId}:`, data.error);
            }
            
        } catch (error) {
            // Only log error if it wasn't an abort
            if (error.name !== 'AbortError') {
                console.error(`[Search] Search failed for request #${currentRequestId}:`, error);
            } else {
                console.log(`[Search] Request #${currentRequestId} was aborted`);
            }
        } finally {
            // Clear the controller if this was the current request
            if (this.currentSearchController && !signal.aborted) {
                this.currentSearchController = null;
            }
        }
    }

    displayResults(results, searchDuration) {
        this.searchTime.textContent = searchDuration;
        this.resultCount.textContent = results.length;
        this.resultsSection.classList.add('show');
        this.resultsTableBody.innerHTML = '';
        const fragment = document.createDocumentFragment();
        results.forEach((file) => fragment.appendChild(this.createResultRow(file)));
        this.resultsTableBody.appendChild(fragment);
        this.noResults.style.display = results.length === 0 ? 'block' : 'none';
    }

    hideResults() {
        this.resultsSection.classList.remove('show');
    }

    clearSearch() {
        // Abort any ongoing request
        if (this.currentSearchController) {
            this.currentSearchController.abort();
            this.currentSearchController = null;
        }
        
        // Clear timeout
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
            this.searchTimeout = null;
        }
        
        // Reset search state
        this.searchInput.value = '';
        this.currentSearchQuery = '';
        this.fileTypeFilter.value = 'all';
        this.cancelBtn.style.display = 'none';
        this.hideResults();
        this.searchInput.focus();
    }

    createResultRow(file) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><div class="file-name" title="${file.name}"><span class="file-icon">${this.getFileIcon(file.extension)}</span><span class="file-name-text">${file.name}</span></div></td>
            <td>${file.extension}</td>
            <td>${this.formatFileSize(file.size)}</td>
            <td>${this.formatDate(file.modified)}</td>
            <td class="actions-cell"></td>
        `;
        const actionsCell = row.querySelector('.actions-cell');
        const previewBtn = document.createElement('button');
        previewBtn.className = 'preview-btn';
        previewBtn.textContent = 'Preview';
        previewBtn.addEventListener('click', () => this.showPreview(file));
        actionsCell.appendChild(previewBtn);
        const openBtn = document.createElement('button');
        openBtn.className = 'open-btn';
        openBtn.textContent = 'Open';
        openBtn.addEventListener('click', () => this.openFileInSystem(file.path));
        actionsCell.appendChild(openBtn);
        return row;
    }

    async openFileInSystem(filePath) {
        try {
            await fetch('/api/open-file', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filePath
                })
            });
        } catch (error) {
            console.error('Error opening file:', error);
            alert('Could not open the file.');
        }
    }
    
    async showPreview(file) {
        this.modalTitle.textContent = `Loading: ${file.name}`;
        this.modalBody.innerHTML = `<p>Please wait...</p>`;
        this.modalBody.style.fontFamily = 'monospace';
        this.previewModal.classList.add('show');

        console.log('Preview request for file:', file);
        console.log('Current search query for highlighting:', this.currentSearchQuery);
        console.log('File path to highlight:', file.path);
        console.log('File name to highlight:', file.name);
        console.log('Does path contain search term?', file.path.toLowerCase().includes(this.currentSearchQuery.toLowerCase()));
        console.log('Does name contain search term?', file.name.toLowerCase().includes(this.currentSearchQuery.toLowerCase()));

        // Check if there are any other properties in the file object that might contain the search term
        console.log('All file object properties:', Object.keys(file));
            Object.keys(file).forEach(key => {
                if (typeof file[key] === 'string' && file[key].toLowerCase().includes(this.currentSearchQuery.toLowerCase())) {
                    console.log(`Found search term "${this.currentSearchQuery}" in file.${key}:`, file[key]);
                }
            });

        try {
            const response = await fetch(`/api/preview/${file.id}`);
            
            if (!response.ok) {
                let errorData;
                try {
                    errorData = await response.json();
                } catch {
                    errorData = { error: `Server error: ${response.status} ${response.statusText}` };
                }
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            // Create enhanced modal header with path highlighting
            const highlightedPath = this.highlightPath(file.path, this.currentSearchQuery);
            this.modalTitle.innerHTML = `
                <div class="modal-title-content">
                    <div class="file-name">${this.highlightSearchTerms(file.name, this.currentSearchQuery)}</div>
                    <div class="file-path" title="${file.path}">${highlightedPath}</div>
                </div>
            `;
            
            if (data.success && data.content) {
                if (data.type === 'image') {
                    this.modalBody.innerHTML = `<img src="${data.content}" style="max-width: 100%; height: auto;" alt="Preview">`;
                    this.modalBody.style.fontFamily = 'var(--font-family)';
                } else if (data.type === 'html') {
                    // Apply search highlighting to HTML content
                    const highlighted = this.highlightSearchTermsInHTML(data.content, this.currentSearchQuery);
                    this.modalBody.innerHTML = highlighted;
                    this.modalBody.style.fontFamily = 'var(--font-family)';
                } else {
                    // Text content
                    const sanitizedContent = this.escapeHtml(data.content);
                    const highlighted = this.highlightSearchTerms(sanitizedContent, this.currentSearchQuery);
                    this.modalBody.innerHTML = `<pre>${highlighted}</pre>`;
                    this.modalBody.style.fontFamily = 'monospace';
                }

                // Auto-scroll to first match and show status after content is loaded
                setTimeout(() => {
                    this.scrollToFirstMatch();
                }, 100);

            } else {
                this.modalBody.innerHTML = `<p>Error: ${data.error || 'No preview available.'}</p>`;
            }
            
        } catch (error) {
            console.error('Preview error:', error);
            this.modalTitle.innerHTML = `
                <div class="modal-title-content">
                    <div class="file-name">Preview Failed: ${file.name}</div>
                    <div class="file-path" title="${file.path}">${file.path}</div>
                </div>
            `;
            this.modalBody.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
        }
    }

    scrollToFirstMatch() {
        const firstMatch = this.modalBody.querySelector('mark');
        if (firstMatch) {
            console.log('Found content match, scrolling to it');
            firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Add highlight effect
            firstMatch.style.transition = 'box-shadow 0.3s ease-in-out';
            firstMatch.style.boxShadow = '0 0 15px 5px #fef08a';
            
            setTimeout(() => { 
                firstMatch.style.boxShadow = ''; 
            }, 2000);
        } else {
            // Check if there are path highlights instead
            const pathMatch = document.querySelector('.file-path mark.path-highlight');
            if (pathMatch) {
                console.log('Found path match');
                pathMatch.style.transition = 'box-shadow 0.3s ease-in-out';
                pathMatch.style.boxShadow = '0 0 10px 3px #fef08a';
                setTimeout(() => { 
                    pathMatch.style.boxShadow = ''; 
                }, 2000);
            } else {
                // FIXED: Actually check if path/filename contains the term before showing the message
                const currentFile = this.getCurrentFileInfo();
                const query = this.currentSearchQuery.toLowerCase();
                let matchReason = '';
                
                if (currentFile) {
                    const pathContains = currentFile.path.toLowerCase().includes(query);
                    const nameContains = currentFile.name.toLowerCase().includes(query);
                    
                    if (pathContains && nameContains) {
                        matchReason = 'path and filename';
                    } else if (pathContains) {
                        matchReason = 'file path';
                    } else if (nameContains) {
                        matchReason = 'filename';
                    }
                }
                
                if (matchReason) {
                    console.log(`No content matches found for "${this.currentSearchQuery}" - file matched due to ${matchReason} containing the search term`);
                } else {
                    console.log(`No visible matches found for "${this.currentSearchQuery}" - file matched through search index or metadata`);
                }
                
                // Show a helpful message to user
                this.showHighlightStatus();
            }
        }
    }
    
    showHighlightStatus() {
    // Create or update a status message in the modal
    let statusEl = this.modalBody.querySelector('.highlight-status');
    if (!statusEl && this.currentSearchQuery) {
        statusEl = document.createElement('div');
        statusEl.className = 'highlight-status';
        statusEl.style.cssText = `
            position: sticky;
            top: 0;
            background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
            color: #92400e;
            padding: 12px 16px;
            margin: -10px -10px 20px -10px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 2px 8px rgba(146, 64, 14, 0.1);
            border: 1px solid #fcd34d;
            z-index: 10;
        `;
        
        // FIXED: Actually check if path/filename contains the term
        const reasons = [];
        const query = this.currentSearchQuery.toLowerCase();
        const currentFile = this.getCurrentFileInfo();
        
        if (currentFile) {
            if (currentFile.name.toLowerCase().includes(query)) {
                reasons.push('filename');
            }
            if (currentFile.path.toLowerCase().includes(query)) {
                reasons.push('file path');
            }
        }
        
        const contentMatches = this.modalBody.querySelectorAll('mark').length;
        
        if (contentMatches > 0) {
            statusEl.innerHTML = `
                <strong>📍 ${contentMatches} match${contentMatches === 1 ? '' : 'es'} found</strong><br>
                Search term "${this.escapeHtml(this.currentSearchQuery)}" highlighted in content below.
            `;
        } else if (reasons.length > 0) {
            statusEl.innerHTML = `
                <strong>📂 Match found in ${reasons.join(' and ')}</strong><br>
                Search term "${this.escapeHtml(this.currentSearchQuery)}" appears in the ${reasons.join(' and ')} but not in the file content.
            `;
        } else {
            // FIXED: More accurate message when no visible matches are found
            statusEl.innerHTML = `
                <strong>🔍 Match found in search index</strong><br>
                This file appeared in search results, but "${this.escapeHtml(this.currentSearchQuery)}" may be in metadata, cached content, or other indexed properties not visible in this preview.
            `;
        }
        
        this.modalBody.insertBefore(statusEl, this.modalBody.firstChild);
    }
}
    
    getCurrentFileInfo() {
        // Extract file info from modal title
        const titleEl = this.modalTitle.querySelector('.file-name');
        const pathEl = this.modalTitle.querySelector('.file-path');
        if (titleEl && pathEl) {
            return {
                name: titleEl.textContent,
                path: pathEl.getAttribute('title') || pathEl.textContent
            };
        }
        return null;
    }

    hideModal() {
        this.previewModal.classList.remove('show');
    }

    // Enhanced search term highlighting with better word boundary detection
    highlightSearchTerms(content, query) {
        if (!query || !content || query === '*') return content;
        
        // Split query into individual terms, removing quotes and empty strings
        const terms = query.replace(/"/g, '').split(/\s+/).filter(Boolean);
        
        let highlightedContent = content;
        let totalMatches = 0;
        
        terms.forEach((term, index) => {
            if (term.length < 1) return; // Skip very short terms
            
            // Escape special regex characters but allow partial matching
            const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            
            // Create a regex that matches the term case-insensitively
            // Use word boundaries for better matching when appropriate
            let regexPattern;
            if (/^[a-zA-Z0-9_]+$/.test(term)) {
                // For alphanumeric terms, try word boundary matching first
                regexPattern = `\\b(${escapedTerm})\\b`;
            } else {
                // For terms with special chars, use direct matching
                regexPattern = `(${escapedTerm})`;
            }
            
            const regex = new RegExp(regexPattern, 'gi');
            const beforeCount = (highlightedContent.match(/<mark>/g) || []).length;
            
            // First try with word boundaries
            let newContent = highlightedContent.replace(regex, (match, p1, offset, string) => {
                // Check if we're already inside a <mark> tag to avoid double-highlighting
                const beforeMatch = string.substring(Math.max(0, offset - 50), offset);
                
                // Count open and close tags before this position
                const openTags = (beforeMatch.match(/<mark[^>]*>/g) || []).length;
                const closeTags = (beforeMatch.match(/<\/mark>/g) || []).length;
                
                if (openTags > closeTags) {
                    // We're inside a mark tag, don't highlight again
                    return match;
                }
                
                return `<mark>${p1}</mark>`;
            });
            
            // If word boundary didn't match anything for alphanumeric terms, try without boundaries
            if (/^[a-zA-Z0-9_]+$/.test(term) && newContent === highlightedContent) {
                const fallbackRegex = new RegExp(`(${escapedTerm})`, 'gi');
                newContent = highlightedContent.replace(fallbackRegex, (match, p1, offset, string) => {
                    const beforeMatch = string.substring(Math.max(0, offset - 50), offset);
                    const openTags = (beforeMatch.match(/<mark[^>]*>/g) || []).length;
                    const closeTags = (beforeMatch.match(/<\/mark>/g) || []).length;
                    
                    if (openTags > closeTags) {
                        return match;
                    }
                    
                    return `<mark>${p1}</mark>`;
                });
            }
            
            highlightedContent = newContent;
            
            const afterCount = (highlightedContent.match(/<mark>/g) || []).length;
            const newMatches = afterCount - beforeCount;
            totalMatches += newMatches;
        });
        
        return highlightedContent;
    }

    // Enhanced HTML highlighting method
    highlightSearchTermsInHTML(htmlContent, query) {
        if (!query || !htmlContent || query === '*') return htmlContent;

        console.log('Highlighting terms in HTML content:', { query, contentLength: htmlContent.length });

        const terms = query.replace(/"/g, '').split(/\s+/).filter(Boolean);
        let highlightedContent = htmlContent;

        terms.forEach(term => {
            const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            
            // Create a temporary div to work with the DOM properly
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = highlightedContent;
            
            // Function to recursively highlight text nodes
            const highlightInTextNodes = (node) => {
                if (node.nodeType === Node.TEXT_NODE) {
                    const text = node.textContent;
                    const regex = new RegExp(`(${escapedTerm})`, 'gi');
                    if (regex.test(text)) {
                        const highlightedText = text.replace(regex, '<mark>$1</mark>');
                        const wrapper = document.createElement('span');
                        wrapper.innerHTML = highlightedText;
                        
                        // Replace the text node with the highlighted content
                        const parent = node.parentNode;
                        const childNodes = Array.from(wrapper.childNodes);
                        childNodes.forEach(child => parent.insertBefore(child, node));
                        parent.removeChild(node);
                    }
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    // Don't highlight inside <mark> tags to avoid nested highlighting
                    if (node.tagName !== 'MARK') {
                        const childNodes = Array.from(node.childNodes);
                        childNodes.forEach(child => highlightInTextNodes(child));
                    }
                }
            };
            
            highlightInTextNodes(tempDiv);
            highlightedContent = tempDiv.innerHTML;
        });

        return highlightedContent;
    }

    // Path highlighting with better visual distinction
    highlightPath(filePath, query) {
        if (!query || !filePath || query === '*') {
            console.log('highlightPath: No query or path, returning original:', filePath);
            return filePath;
        }
        
        console.log('highlightPath called with:', { filePath, query });
        
        const terms = query.replace(/"/g, '').split(/\s+/).filter(Boolean);
        let highlightedPath = filePath;
        
        terms.forEach(term => {
            const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(${escapedTerm})`, 'gi');
            const beforeHighlight = highlightedPath;
            highlightedPath = highlightedPath.replace(regex, '<mark class="path-highlight">$1</mark>');
            console.log(`highlightPath: term "${term}" - before:`, beforeHighlight);
            console.log(`highlightPath: term "${term}" - after:`, highlightedPath);
            
            // Also check if the term exists in the path at all
            const pathContainsTerm = filePath.toLowerCase().includes(term.toLowerCase());
            console.log(`highlightPath: does path contain "${term}"?`, pathContainsTerm);
        });
        
        console.log('highlightPath: Final result:', highlightedPath);
        return highlightedPath;
    }

    // HTML escape utility
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    getFileIcon(ext) {
        const icons = {
            'pdf': '📄', 'doc': '📄', 'docx': '📄', 'txt': '📝', 'md': '📝',
            'xls': '📊', 'xlsx': '📊', 'csv': '📊', 'ppt': '📊', 'pptx': '📊',
            'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️', 'bmp': '🖼️', 'svg': '🖼️',
            'mp4': '🎬', 'mov': '🎬', 'avi': '🎬', 'mp3': '🎵', 'wav': '🎵',
            'js': '💻', 'ts': '💻', 'json': '💻', 'html': '🌐', 'css': '🎨',
            'py': '🐍', 'java': '☕', 'zip': '📦', 'rar': '📦', '7z': '📦',
            'ttf': '🖋️', 'otf': '🖋️'
        };
        return icons[ext] || '📄';
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return parseFloat((bytes / Math.pow(1024, i)).toFixed(1)) + ' ' + ['B', 'KB', 'MB', 'GB'][i];
    }
    
    formatDate(dateStr) {
        const date = new Date(dateStr);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const day = String(date.getDate()).padStart(2, '0');
        const month = months[date.getMonth()];
        const year = date.getFullYear();
        let hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // 0 should be 12
        const hoursStr = String(hours).padStart(2, '0');
        return `${day}-${month}-${year} ${hoursStr}:${minutes} ${ampm}`;
    }

    async updateCurrentPath() {
        try {
            const response = await fetch(`/api/resolve-directory?directory=${encodeURIComponent(this.selectedDirectory)}`);
            const data = await response.json();
            if ('success' in data && data.success) {
                const parts = data.path.split(/[/\\]/);
                this.pathValue.textContent = parts.pop() || data.path;
                this.pathValue.title = data.path;
            } else {
                this.pathValue.textContent = '...';
                this.pathValue.title = '';
            }
        } catch (e) {
            this.pathValue.textContent = 'Invalid Path';
            this.pathValue.title = 'The selected path could not be accessed.';
        }
    }

    async initiateIndexing() {
        if (this.indexingPollInterval) clearInterval(this.indexingPollInterval);

        const directoryToIndex = this.selectedDirectory;
        fetch(`/api/index?directory=${encodeURIComponent(directoryToIndex)}`, {
            method: 'POST'
        });
        this.indexingPollInterval = setInterval(() => this.pollIndexingStatus(directoryToIndex), 2000);
    }

    async pollIndexingStatus(directoryToPoll) {
        if (directoryToPoll !== this.selectedDirectory) {
            clearInterval(this.indexingPollInterval);
            this.indexingPollInterval = null;
            return;
        }

        try {
            const response = await fetch(`/api/index/status?directory=${encodeURIComponent(directoryToPoll)}`);
            const data = await response.json();

            if (data.success && directoryToPoll === this.selectedDirectory) {
                console.log('Status data:', data.status);

                if (data.status.status === 'complete' || data.status.status === 'idle') {
                    this.setSearchUIReady(true);
                    clearInterval(this.indexingPollInterval);
                    this.indexingPollInterval = null;
                } else if (data.status.status === 'error') {
                    this.setSearchUIReady(true);
                    this.indexingProgressContainer.style.display = 'block';
                    this.indexingStatusText.textContent = `Error: ${data.status.error || 'Unknown error'}`;
                    this.indexingProgressBar.value = 0;
                    clearInterval(this.indexingPollInterval);
                    this.indexingPollInterval = null;
                } else {
                    this.setSearchUIReady(false);
                    this.updateIndexingProgress(data.status);
                }
            }
        } catch (error) {
            console.error("Polling error:", error);
            if (directoryToPoll === this.selectedDirectory) {
                this.setSearchUIReady(true);
                clearInterval(this.indexingPollInterval);
                this.indexingPollInterval = null;
            }
        }
    }

    updateIndexingProgress(status) {
        console.log('Progress update:', status);

        const normalizePath = (path) => {
            return path ? path.replace(/\\/g, '/').toLowerCase() : '';
        };

        const statusFolderNorm = normalizePath(status.folder);
        const currentPathNorm = normalizePath(this.pathValue.title);
        const selectedDirNorm = normalizePath(this.selectedDirectory);

        const isCurrentDirectory = statusFolderNorm === currentPathNorm ||
            statusFolderNorm === selectedDirNorm ||
            currentPathNorm.includes(statusFolderNorm) ||
            statusFolderNorm.includes(currentPathNorm);

        if (isCurrentDirectory) {
            this.indexingProgressContainer.style.display = 'block';

            if (status.totalFiles > 0) {
                this.indexingProgressBar.max = status.totalFiles;
                this.indexingProgressBar.value = status.indexedCount;
                const percentage = Math.round((status.indexedCount / status.totalFiles) * 100);
                this.indexingStatusText.textContent = `Indexing ${status.indexedCount.toLocaleString()} of ${status.totalFiles.toLocaleString()} files (${percentage}%)`;
            } else {
                this.indexingStatusText.textContent = `Discovering files in folder...`;
                this.indexingProgressBar.removeAttribute('value');
            }
        }
    }

    setSearchUIReady(isReady) {
        this.searchInput.disabled = !isReady;
        this.indexingProgressContainer.style.display = isReady ? 'none' : 'block';
        this.searchInput.placeholder = isReady ? 'Search for files...' : 'Indexing, please wait...';

        if (isReady) {
            this.indexingStatusText.textContent = 'Indexing complete';
            this.indexingProgressBar.value = 0;
            this.indexingProgressBar.max = 100;
        } else {
            this.indexingStatusText.textContent = 'Starting indexing...';
            this.indexingProgressBar.value = 0;
            this.indexingProgressBar.max = 100;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.fileSearcher = new FileSearcher();
});
