const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const { EventEmitter } = require('events');

class FileWatcher extends EventEmitter {
    constructor() {
        super();
        this.watchers = new Map(); // folder -> watcher info
        this.debounceTimers = new Map(); // filePath -> timer
        this.maxWatchedFolders = 5;
        this.debounceDelay = 2000; // 2 seconds conservative debounce
        this.isWatchingEnabled = true;
    }

    async startWatching(folderPath) {
        if (!this.isWatchingEnabled) {
            console.log('[Watcher] Watching is disabled');
            return false;
        }

        if (this.watchers.size >= this.maxWatchedFolders) {
            console.log(`[Watcher] Maximum watched folders (${this.maxWatchedFolders}) reached`);
            return false;
        }

        if (this.watchers.has(folderPath)) {
            console.log(`[Watcher] Already watching: ${folderPath}`);
            return true;
        }

        try {
            // Verify folder exists and is accessible
            await fs.promises.access(folderPath, fs.constants.R_OK);
            
            // Use chokidar for better performance and cross-platform support
            const watcher = chokidar.watch(folderPath, {
                ignored: [
                    /(^|[\/\\])\../,  // ignore dotfiles
                    /log\.txt$/,      // ignore log files to prevent feedback loops
                    /\.log$/,         // ignore all .log files
                    /\.tmp$/,         // ignore temporary files
                    /node_modules/    // ignore node_modules
                ],
                persistent: true,
                ignoreInitial: true,
                followSymlinks: false,
                depth: 99,
                awaitWriteFinish: {
                    stabilityThreshold: 1000,
                    pollInterval: 100
                }
            });

            // Set up event handlers
            watcher
                .on('add', (filePath) => this.handleFileSystemEvent(folderPath, 'add', filePath))
                .on('change', (filePath) => this.handleFileSystemEvent(folderPath, 'change', filePath))
                .on('unlink', (filePath) => this.handleFileSystemEvent(folderPath, 'unlink', filePath))
                .on('error', (error) => {
                    console.error(`[Watcher] Error watching ${folderPath}:`, error);
                });

            this.watchers.set(folderPath, {
                watcher,
                startTime: Date.now(),
                eventCount: 0
            });

            console.log(`[Watcher] Started watching: ${folderPath}`);
            this.emit('watcherStarted', folderPath);
            return true;

        } catch (error) {
            console.error(`[Watcher] Failed to watch ${folderPath}:`, error.message);
            return false;
        }
    }

    stopWatching(folderPath) {
        const watcherInfo = this.watchers.get(folderPath);
        if (watcherInfo) {
            watcherInfo.watcher.close();
            this.watchers.delete(folderPath);
            console.log(`[Watcher] Stopped watching: ${folderPath}`);
            this.emit('watcherStopped', folderPath);
            return true;
        }
        return false;
    }

    handleFileSystemEvent(basePath, eventType, filePath) {
        if (!filePath) return;

        // For chokidar, filePath is already the full path
        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(basePath, filePath);
        
        // Skip ignored files and directories
        if (this.shouldIgnoreFile(path.basename(fullPath))) {
            return;
        }

        // Update event count
        const watcherInfo = this.watchers.get(basePath);
        if (watcherInfo) {
            watcherInfo.eventCount++;
        }

        console.log(`[Watcher] File event: ${eventType} - ${fullPath}`);

        // Debounce rapid changes
        this.debounceFileChange(fullPath, eventType, basePath);
    }

    debounceFileChange(filePath, eventType, basePath) {
        // Clear existing timer
        if (this.debounceTimers.has(filePath)) {
            clearTimeout(this.debounceTimers.get(filePath));
        }

        // Set new timer
        const timer = setTimeout(async () => {
            this.debounceTimers.delete(filePath);
            await this.processFileChange(filePath, eventType, basePath);
        }, this.debounceDelay);

        this.debounceTimers.set(filePath, timer);
    }

    async processFileChange(filePath, eventType, basePath) {
        try {
            // Map chokidar events to our internal types
            let changeType;
            
            if (eventType === 'unlink') {
                changeType = 'deleted';
            } else if (eventType === 'add') {
                changeType = 'added';
            } else if (eventType === 'change') {
                changeType = 'modified';
            }
            
            console.log(`[Watcher] Processing ${changeType}: ${filePath}`);
            this.emit('fileChanged', {
                type: changeType,
                filePath,
                folderPath: basePath,
                eventType
            });
        } catch (error) {
            console.error(`[Watcher] Error processing file change ${filePath}:`, error.message);
        }
    }

    shouldIgnoreFile(filePath) {
        const basename = path.basename(filePath);
        const ignoredPatterns = [
            // System files
            /^\./, // Hidden files
            /^~\$/, // Office temp files
            /\.tmp$/i,
            /\.temp$/i,
            /^Thumbs\.db$/i,
            /^\.DS_Store$/i,
            // Directories to ignore
            /\.git$/,
            /\.indexes$/,
            /node_modules$/,
            /\.vscode$/,
            /\.idea$/
        ];

        return ignoredPatterns.some(pattern => pattern.test(basename));
    }

    getWatchingStatus() {
        const status = {};
        for (const [folderPath, info] of this.watchers) {
            status[folderPath] = {
                watching: true,
                startTime: info.startTime,
                eventCount: info.eventCount,
                uptime: Date.now() - info.startTime
            };
        }
        return {
            enabled: this.isWatchingEnabled,
            watchedFolders: status,
            totalWatchers: this.watchers.size,
            maxWatchers: this.maxWatchedFolders
        };
    }

    setWatchingEnabled(enabled) {
        this.isWatchingEnabled = enabled;
        if (!enabled) {
            // Stop all watchers
            for (const folderPath of this.watchers.keys()) {
                this.stopWatching(folderPath);
            }
        }
        console.log(`[Watcher] Watching ${enabled ? 'enabled' : 'disabled'}`);
    }

    cleanup() {
        // Clean up all watchers and timers
        for (const folderPath of this.watchers.keys()) {
            this.stopWatching(folderPath);
        }
        
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();
        
        console.log('[Watcher] Cleanup completed');
    }
}

// Export singleton instance
const fileWatcher = new FileWatcher();
module.exports = fileWatcher;
