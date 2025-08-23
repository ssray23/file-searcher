const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();

const INDEXES_DIR = path.join(__dirname, '.indexes');

function getDbPath(folder) {
    const hash = crypto.createHash('md5').update(folder).digest('hex');
    return path.join(INDEXES_DIR, `${hash}.db`);
}

async function fixDatabaseSchema(folder) {
    const dbPath = getDbPath(folder);
    
    if (!fs.existsSync(dbPath)) {
        console.log(`Database doesn't exist at ${dbPath}. No action needed.`);
        return;
    }
    
    console.log(`Fixing database schema for: ${dbPath}`);
    
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath);
        
        db.serialize(() => {
            // Check current schema
            db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='files'", (err, row) => {
                if (err) {
                    console.error('Error checking schema:', err);
                    db.close();
                    return reject(err);
                }
                
                if (!row) {
                    console.log('Files table does not exist. Database will be recreated on next index.');
                    db.close();
                    return resolve();
                }
                
                console.log('Current files table schema:', row.sql);
                
                if (!row.sql.includes('fullpath')) {
                    console.log('Schema update required. Dropping and recreating tables...');
                    
                    // Drop tables in correct order
                    db.run("DROP TABLE IF EXISTS content", (dropErr) => {
                        if (dropErr) {
                            console.warn('Warning dropping content table:', dropErr.message);
                        }
                        
                        db.run("DROP TABLE IF EXISTS files", (dropFilesErr) => {
                            if (dropFilesErr) {
                                console.error('Error dropping files table:', dropFilesErr);
                                db.close();
                                return reject(dropFilesErr);
                            }
                            
                            console.log('Tables dropped successfully. Database will be recreated on next index.');
                            db.close();
                            resolve();
                        });
                    });
                } else {
                    console.log('Schema is already correct.');
                    db.close();
                    resolve();
                }
            });
        });
    });
}

// Usage examples:
async function fixAllDatabases() {
    try {
        if (!fs.existsSync(INDEXES_DIR)) {
            console.log(`Indexes directory doesn't exist: ${INDEXES_DIR}`);
            return;
        }
        
        const dbFiles = fs.readdirSync(INDEXES_DIR).filter(file => file.endsWith('.db'));
        console.log(`Found ${dbFiles.length} database files to check`);
        
        for (const dbFile of dbFiles) {
            const dbPath = path.join(INDEXES_DIR, dbFile);
            console.log(`\nChecking: ${dbPath}`);
            
            // We need to reverse-engineer the folder from the hash
            // Since we can't easily do that, we'll just fix the database directly
            await fixDatabaseByPath(dbPath);
        }
        
        console.log('\nAll databases checked and fixed if needed.');
    } catch (error) {
        console.error('Error fixing databases:', error);
    }
}

async function fixDatabaseByPath(dbPath) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath);
        
        db.serialize(() => {
            db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='files'", (err, row) => {
                if (err) {
                    console.error('Error checking schema:', err);
                    db.close();
                    return reject(err);
                }
                
                if (!row) {
                    console.log('  - Files table does not exist. Will be recreated on next index.');
                    db.close();
                    return resolve();
                }
                
                if (!row.sql.includes('fullpath')) {
                    console.log('  - Schema update required. Dropping tables...');
                    
                    db.run("DROP TABLE IF EXISTS content", (dropErr) => {
                        if (dropErr) {
                            console.warn('  - Warning dropping content table:', dropErr.message);
                        }
                        
                        db.run("DROP TABLE IF EXISTS files", (dropFilesErr) => {
                            if (dropFilesErr) {
                                console.error('  - Error dropping files table:', dropFilesErr);
                                db.close();
                                return reject(dropFilesErr);
                            }
                            
                            console.log('  - Tables dropped successfully.');
                            db.close();
                            resolve();
                        });
                    });
                } else {
                    console.log('  - Schema is already correct.');
                    db.close();
                    resolve();
                }
            });
        });
    });
}

// Export functions for use as a module
module.exports = {
    fixDatabaseSchema,
    fixAllDatabases,
    fixDatabaseByPath
};

// If run directly, fix all databases
if (require.main === module) {
    fixAllDatabases().then(() => {
        console.log('Database fix script completed.');
        process.exit(0);
    }).catch(err => {
        console.error('Database fix script failed:', err);
        process.exit(1);
    });
}