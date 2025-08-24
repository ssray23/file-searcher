// FILE: search_race_condition_fix.js
// INSTRUCTIONS: Apply these changes to your script.js file to fix the race condition

// 1. ADD these properties to the FileSearcher constructor (around line 30):
// Add after line: this.currentSearchQuery = '';

        this.currentSearchController = null; // For aborting requests
        this.searchRequestId = 0; // For tracking request order
        this.searchTimeout = null; // For debouncing (you might already have this)

// 2. REPLACE the handleSearchInput method (around line 65):
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

// 3. REPLACE the performSearch method (around line 70):
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

// 4. UPDATE the clearSearch method (around line 105):
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
