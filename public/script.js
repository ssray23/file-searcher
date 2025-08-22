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
        this.handleFolderChange({ target: { value: 'current' } });
    }

    initializeEventListeners() {
        this.searchInput.addEventListener('input', () => this.handleSearchInput());
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
        this.setSearchUIReady(false);
        const value = e.target.value;
        this.customPathInput.style.display = (value === 'custom') ? 'inline-block' : 'none';
        this.selectedDirectory = (value === 'custom') ? this.customPathInput.value.trim() || 'current' : value;
        if (value === 'custom') this.customPathInput.focus();
        
        this.hideResults();
        await this.updateCurrentPath();
        this.initiateIndexing();
    }

    async handleCustomPath(e) {
        this.setSearchUIReady(false);
        const path = e.target.value.trim();
        if (path) {
            this.selectedDirectory = path;
            this.hideResults();
            await this.updateCurrentPath();
            this.initiateIndexing();
        }
    }

    async initiateIndexing() {
        if (this.indexingPollInterval) clearInterval(this.indexingPollInterval);
        const directoryToIndex = this.selectedDirectory;
        fetch(`/api/index?directory=${encodeURIComponent(directoryToIndex)}`, { method: 'POST' });
        this.indexingPollInterval = setInterval(() => this.pollIndexingStatus(directoryToIndex), 2500);
    }

    async pollIndexingStatus(directoryToPoll) {
        if (directoryToPoll !== this.selectedDirectory) return;
        try {
            const response = await fetch(`/api/index/status?directory=${encodeURIComponent(directoryToPoll)}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            if (data.success && directoryToPoll === this.selectedDirectory) {
                 if (data.status.status === 'complete') {
                    this.setSearchUIReady(true);
                    clearInterval(this.indexingPollInterval);
                } else if (data.status.status === 'indexing') {
                    this.updateIndexingProgress(data.status);
                }
            }
        } catch (error) {
            console.error("Polling error:", error);
            if (directoryToPoll === this.selectedDirectory) {
                this.setSearchUIReady(true);
                clearInterval(this.indexingPollInterval);
            }
        }
    }

    setSearchUIReady(isReady) {
        this.searchInput.disabled = !isReady;
        this.indexingProgressContainer.style.display = isReady ? 'none' : 'block';
        this.searchInput.placeholder = isReady ? 'Search for files...' : 'Indexing, please wait...';
        if (isReady) {
             this.indexingStatusText.textContent = `Indexing...`;
             this.indexingProgressBar.value = 0;
        }
    }

    updateIndexingProgress(status) {
        if (status.totalFiles > 0) {
            this.indexingProgressBar.max = status.totalFiles;
            this.indexingProgressBar.value = status.indexedCount;
            this.indexingStatusText.textContent = `Indexing ${status.indexedCount.toLocaleString()} of ${status.totalFiles.toLocaleString()}...`;
        }
    }

    handleSearchInput() {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => this.performSearch(), 200);
    }

    async performSearch() {
        const query = this.searchInput.value.trim();
        const startTime = performance.now();
        this.cancelBtn.style.display = query ? 'flex' : 'none';
        if (!query) { this.hideResults(); return; }
        try {
            const params = new URLSearchParams({ query, directory: this.selectedDirectory });
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
    
    hideResults() { this.resultsSection.classList.remove('show'); }
    clearSearch() { this.searchInput.value = ''; this.cancelBtn.style.display = 'none'; this.hideResults(); this.searchInput.focus(); }

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
            await fetch('/api/open-file', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filePath }) });
        } catch (error) {
            console.error('Error opening file:', error);
            alert('Could not open the file.');
        }
    }

    async showPreview(file) {
        this.modalTitle.textContent = `Loading: ${file.name}`;
        this.modalBody.innerHTML = ``;
        this.modalBody.style.fontFamily = 'monospace';
        this.previewModal.classList.add('show');
        try {
            const response = await fetch(`/api/preview/${file.id}`);
            const data = await response.json();
            this.modalTitle.textContent = `Preview: ${file.name}`;
            if (data.success && data.content) {
                if (data.type === 'image') {
                    this.modalBody.innerHTML = `<img src="${data.content}" style="max-width: 100%; height: auto; display: block; margin: 0 auto;">`;
                    this.modalBody.style.fontFamily = 'var(--font-family)';
                } else if (data.type === 'html') {
                    this.modalBody.innerHTML = data.content;
                    this.modalBody.style.fontFamily = 'var(--font-family)';
                } else {
                    const sanitizedContent = data.content.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                    const highlighted = this.highlightSearchTerms(sanitizedContent, this.searchInput.value);
                    this.modalBody.innerHTML = `<pre>${highlighted}</pre>`;
                }
                const firstMatch = this.modalBody.querySelector('mark');
                if (firstMatch) {
                    firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    firstMatch.style.boxShadow = '0 0 15px 5px #fef08a';
                    setTimeout(() => { firstMatch.style.boxShadow = ''; }, 2000);
                }
            } else {
                this.modalBody.innerHTML = `<p>${data.error || 'No preview available.'}</p>`;
            }
        } catch (error) {
            this.modalBody.innerHTML = `<p>Could not load preview.</p>`;
        }
    }
    
    hideModal() { this.previewModal.classList.remove('show'); }

    highlightSearchTerms(content, query) {
        if (!query || !content) return content;
        const terms = query.replace(/"/g, '').split(/\s+/).filter(Boolean);
        let highlightedContent = content;
        terms.forEach(term => {
            const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
            highlightedContent = highlightedContent.replace(regex, `<mark>$1</mark>`);
        });
        return highlightedContent;
    }

    getFileIcon(ext) {
        const icons = { 'pdf':'📄','doc':'📄','docx':'📄','txt':'📝','md':'📝','xls':'📊','xlsx':'📊','csv':'📊','ppt':'📊','pptx':'📊','jpg':'🖼️','jpeg':'🖼️','png':'🖼️','gif':'🖼️','bmp':'🖼️','svg':'🖼️','mp4':'🎬','mov':'🎬','avi':'🎬','mp3':'🎵','wav':'🎵','js':'💻','ts':'💻','json':'💻','html':'🌐','css':'🎨','py':'🐍','java':'☕','zip':'📦','rar':'📦','7z':'📦','ttf':'🖋️','otf':'🖋️' };
        return icons[ext] || '📄';
    }
    formatFileSize(bytes) { if (bytes === 0) return '0 B'; const i = Math.floor(Math.log(bytes) / Math.log(1024)); return parseFloat((bytes / Math.pow(1024, i)).toFixed(1)) + ' ' + ['B', 'KB', 'MB', 'GB'][i]; }
    formatDate(dateStr) { return new Date(dateStr).toLocaleString(); }
    
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
        } catch(e) { 
             this.pathValue.textContent = 'Invalid Path';
             this.pathValue.title = 'The selected path could not be accessed.';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => { window.fileSearcher = new FileSearcher(); });