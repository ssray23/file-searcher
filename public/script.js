// FILE: C:\Users\su.ray\OneDrive - Reply\Suddha\Personal Projects\file-searcher\public\script.js

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

        // ADDED: A reference to the file type filter dropdown
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

        this.initializeEventListeners();
        this.handleFolderChange({
            target: {
                value: 'current'
            }
        });
    }

    initializeEventListeners() {
        this.searchInput.addEventListener('input', () => this.handleSearchInput());

        // ADDED: An event listener to re-run the search whenever the filter is changed
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
        // MODIFIED: Corrected logic to properly show and handle custom path input
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
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => this.performSearch(), 200);
    }

    async performSearch() {
        const query = this.searchInput.value.trim();
        // ADDED: Read the value from the file type filter dropdown
        const fileType = this.fileTypeFilter.value;
        const startTime = performance.now();
        this.cancelBtn.style.display = query ? 'flex' : 'none';

        // MODIFIED: Allows a filter to be active even with an empty search query
        if (!query && fileType === 'all') {
            this.hideResults();
            return;
        }

        try {
            // MODIFIED: Send the selected fileType to the server. Use '*' as a wildcard if query is empty.
            const params = new URLSearchParams({
                query: query || '*',
                directory: this.selectedDirectory,
                fileType
            });
            const response = await fetch(`/api/search?${params}`);
            const data = await response.json();
            if (data.success) {
                this.displayResults(data.files, Math.round(performance.now() - startTime));
            }
        } catch (error) {
            console.error('Search failed:', error);
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
        this.searchInput.value = '';
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
    // Update the showPreview method to include path display:
async showPreview(file) {
    this.modalTitle.textContent = `Loading: ${file.name}`;
    this.modalBody.innerHTML = `<p>Please wait...</p>`;
    this.modalBody.style.fontFamily = 'monospace';
    this.previewModal.classList.add('show');

    console.log('Preview request for file:', file);

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
        
        // Create enhanced modal header with path
        const highlightedPath = this.highlightPath(file.path, this.searchInput.value);
        this.modalTitle.innerHTML = `
            <div class="modal-title-content">
                <div class="file-name">${file.name}</div>
                <div class="file-path" title="${file.path}">${highlightedPath}</div>
            </div>
        `;
        
        if (data.success && data.content) {
            if (data.type === 'image') {
                this.modalBody.innerHTML = `<img src="${data.content}" style="max-width: 100%; height: auto;" alt="Preview">`;
                this.modalBody.style.fontFamily = 'var(--font-family)';
            } else if (data.type === 'html') {
                // Apply search highlighting to HTML content
                const highlighted = this.highlightSearchTermsInHTML(data.content, this.searchInput.value);
                this.modalBody.innerHTML = highlighted;
                this.modalBody.style.fontFamily = 'var(--font-family)';
            } else {
                // Text content
                const sanitizedContent = data.content.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                const highlighted = this.highlightSearchTerms(sanitizedContent, this.searchInput.value);
                this.modalBody.innerHTML = `<pre>${highlighted}</pre>`;
                this.modalBody.style.fontFamily = 'monospace';
            }

            // Auto-scroll to first match after content is loaded
            setTimeout(() => {
                const firstMatch = this.modalBody.querySelector('mark');
                if (firstMatch) {
                    console.log('Found first match, scrolling to it');
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
                    }
                    console.log('No content matches found for highlighting');
                }
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

    hideModal() {
        this.previewModal.classList.remove('show');
    }

    highlightSearchTerms(content, query) {
        if (!query || !content || query === '*') return content;
        const terms = query.replace(/"/g, '').split(/\s+/).filter(Boolean);
        let highlightedContent = content;
        terms.forEach(term => {
            const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
            highlightedContent = highlightedContent.replace(regex, `<mark>$1</mark>`);
        });
        return highlightedContent;
    }

    // NEW METHOD: Add this after the existing highlightSearchTerms method
    highlightSearchTermsInHTML(htmlContent, query) {
        if (!query || !htmlContent || query === '*') return htmlContent;

        const terms = query.replace(/"/g, '').split(/\s+/).filter(Boolean);
        let highlightedContent = htmlContent;

        terms.forEach(term => {
            // Create a regex that matches the term but not inside HTML tags
            const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            // Match text content between HTML tags
            const regex = new RegExp(`(>[^<]*?)(${escapedTerm})([^<]*?<)`, 'gi');
            highlightedContent = highlightedContent.replace(regex, '$1<mark>$2</mark>$3');

            // Also handle text at the beginning or end of the content
            const startRegex = new RegExp(`^([^<]*?)(${escapedTerm})([^<]*?)(<|$)`, 'gi');
            highlightedContent = highlightedContent.replace(startRegex, '$1<mark>$2</mark>$3$4');
        });

        return highlightedContent;
    }

    getFileIcon(ext) {
        const icons = {
            'pdf': '📄',
            'doc': '📄',
            'docx': '📄',
            'txt': '📝',
            'md': '📝',
            'xls': '📊',
            'xlsx': '📊',
            'csv': '📊',
            'ppt': '📊',
            'pptx': '📊',
            'jpg': '🖼️',
            'jpeg': '🖼️',
            'png': '🖼️',
            'gif': '🖼️',
            'bmp': '🖼️',
            'svg': '🖼️',
            'mp4': '🎬',
            'mov': '🎬',
            'avi': '🎬',
            'mp3': '🎵',
            'wav': '🎵',
            'js': '💻',
            'ts': '💻',
            'json': '💻',
            'html': '🌐',
            'css': '🎨',
            'py': '🐍',
            'java': '☕',
            'zip': '📦',
            'rar': '📦',
            '7z': '📦',
            'ttf': '🖋️',
            'otf': '🖋️'
        };
        return icons[ext] || '📄';
    }
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return parseFloat((bytes / Math.pow(1024, i)).toFixed(1)) + ' ' + ['B', 'KB', 'MB', 'GB'][i];
    }
    formatDate(dateStr) {
        return new Date(dateStr).toLocaleString();
    }

    async updateCurrentPath() {
        try {
            const response = await fetch(`/api/resolve-directory?directory=${encodeURIComponent(this.selectedDirectory)}`);
            const data = await response.json();
            if ('success' in data && data.success) {
                const parts = data.path.split(/[/\\]/);
                this.pathValue.textContent = parts.pop() || data.path;
                this.pathValue.title = data.path; // Important: Stores the full path for the previewer to use
            } else {
                this.pathValue.textContent = '...';
                this.pathValue.title = '';
            }
        } catch (e) {
            this.pathValue.textContent = 'Invalid Path';
            this.pathValue.title = 'The selected path could not be accessed.';
        }
    }


    // These methods should be added/updated in your FileSearcher class in script.js
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
                console.log('Status data:', data.status); // Debug log

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

    // Replace the updateIndexingProgress method in script.js with this:

    updateIndexingProgress(status) {
        console.log('Progress update:', status);
        console.log('Current paths:', {
            statusFolder: status.folder,
            pathValueTitle: this.pathValue.title,
            selectedDirectory: this.selectedDirectory
        });

        // Normalize paths for comparison (handle different path separators)
        const normalizePath = (path) => {
            return path ? path.replace(/\\/g, '/').toLowerCase() : '';
        };

        const statusFolderNorm = normalizePath(status.folder);
        const currentPathNorm = normalizePath(this.pathValue.title);
        const selectedDirNorm = normalizePath(this.selectedDirectory);

        // Check if this status update is for the current directory
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
                console.log(`Progress bar updated: ${status.indexedCount}/${status.totalFiles} (${percentage}%)`);
            } else {
                this.indexingStatusText.textContent = `Discovering files in folder...`;
                // Show indeterminate progress
                this.indexingProgressBar.removeAttribute('value');
            }
        } else {
            console.log('Path mismatch - not updating progress:', {
                statusFolderNorm,
                currentPathNorm,
                selectedDirNorm
            });
        }
    }

    setSearchUIReady(isReady) {
        this.searchInput.disabled = !isReady;
        this.indexingProgressContainer.style.display = isReady ? 'none' : 'block';
        this.searchInput.placeholder = isReady ? 'Search for files...' : 'Indexing, please wait...';

        if (isReady) {
            // Reset progress when ready
            this.indexingStatusText.textContent = 'Indexing complete';
            this.indexingProgressBar.value = 0;
            this.indexingProgressBar.max = 100;
        } else {
            // Initialize progress bar when starting
            this.indexingStatusText.textContent = 'Starting indexing...';
            this.indexingProgressBar.value = 0;
            this.indexingProgressBar.max = 100;
        }
    }

    // First, add a method to highlight path components in the FileSearcher class:
    highlightPath(filePath, query) {
        if (!query || !filePath || query === '*') {
            return filePath;
        }
        
        const terms = query.replace(/"/g, '').split(/\s+/).filter(Boolean);
        let highlightedPath = filePath;
        
        terms.forEach(term => {
            const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(${escapedTerm})`, 'gi');
            highlightedPath = highlightedPath.replace(regex, '<mark class="path-highlight">$1</mark>');
        });
        
        return highlightedPath;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.fileSearcher = new FileSearcher();
});