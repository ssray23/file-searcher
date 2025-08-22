# 🔍 File Searcher

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A modern, fast, and powerful local file search engine built with Node.js. This application indexes the content of your files, allowing for full-text search across a wide variety of formats, including PDFs, DOCX, XLSX, and plain text files.

![File Searcher UI](httpshttps://i.imgur.com/gK23U6x.png)

---

## Features

-   **Full-Text Content Search:** Searches *inside* your files, not just the filenames.
-   **Blazing Fast:** Utilizes an SQLite FTS5 (Full-Text Search) index for near-instantaneous search results after initial indexing.
-   **Wide File Format Support:**
    -   📄 Rich text previews for `.docx`
    -   📊 Table previews for `.xlsx`
    -   🖼️ Image previews for `.jpg`, `.png`, `.gif`, etc.
    -   📝 Text content previews for `.pdf`, `.txt`, `.js`, `.py`, `.html`, `.css`, and more.
-   **Targeted Folder Scoping:** Index and search specific directories like `Documents`, `Downloads`, `Desktop`, or any custom path.
-   **"Open in System"**: Directly open any search result with its default application.
-   **Modern, Responsive UI:** A clean and intuitive web interface for a seamless user experience.

## Architecture

The application is built on a simple but powerful client-server architecture, relying on a dedicated indexing service that runs in the background.

-   **Frontend:** A vanilla JavaScript, HTML, and CSS single-page application.
    -   `public/index.html`: The main structure of the application.
    -   `public/styles.css`: All styling for the UI components.
    -   `public/script.js`: Handles all user interactions, API requests to the backend, and dynamic rendering of search results and previews.

-   **Backend:** A Node.js server using the Express.js framework.
    -   `server.cjs`: The core of the backend. It serves the static frontend, provides API endpoints for search, preview, and file operations, and communicates with the indexer.

-   **Indexing Service:** The heart of the application.
    -   `indexer.cjs`: This module is responsible for scanning directories, extracting text content from files, and building/querying the search database. It uses `glob` for efficient file discovery and `sqlite3` with the FTS5 extension to create a powerful full-text search index.

-   **File Previewer:**
    -   `previewer.js`: A dedicated module that contains the logic for extracting content from various file types (`mammoth` for DOCX, `exceljs` for XLSX, `pdf-parse` for PDF, etc.) to generate previews.

## How It Works

1.  **Selection & Indexing:** When a user selects a folder in the UI, a request is sent to the backend to begin indexing. The backend resolves the true path of the folder (handling special cases like OneDrive-synced directories).
2.  **Database Creation:** The `indexer.cjs` module creates a unique SQLite database file for that folder's path inside a hidden `.indexes` directory.
3.  **File Scanning & Content Extraction:** The indexer recursively scans all files in the target directory (intelligently ignoring folders like `node_modules` and `.git`). For each supported file, it extracts the filename, the full path, and its text content.
4.  **Full-Text Indexing:** This extracted text is inserted into an FTS5 virtual table in the SQLite database, which is highly optimized for fast text queries.
5.  **Search Query:** When a user types a search query, it is sent to the `/api/search` endpoint.
6.  **Database Query:** The backend queries the corresponding SQLite database, searching across filenames, file paths, and file content simultaneously. It prioritizes results, ranking filename matches higher than content matches.
7.  **Display Results:** The search results are returned to the frontend and rendered dynamically in the results table.
8.  **Preview/Open:** Clicking "Preview" or "Open" sends the file's unique path to the backend, which then either serves its content for preview or uses the system's default program to open it.

## Setup and Installation

Follow these steps to get the File Searcher running on your local machine.

### Prerequisites

-   [Node.js](https://nodejs.org/) (version 16.0.0 or higher)
-   npm (included with Node.js)

### Installation Steps

1.  **Clone the repository:**
    ```sh
    git clone https://github.com/ssray23/file-searcher.git
    ```

2.  **Navigate to the project directory:**
    ```sh
    cd file-searcher
    ```

3.  **Install the dependencies:**
    ```sh
    npm install
    ```
    *Note: This may take a moment as it needs to download `sqlite3` and other libraries.*

4.  **Run the application:**
    ```sh
    npm start
    ```
    The server will start, and you will see the message `File Searcher server running on http://localhost:3001`.

5.  **Open the application:**
    Open your web browser and navigate to **http://localhost:3001**.

> **Important Note for Windows Users:**
> To properly index protected system folders like your main `Documents` directory (especially if it is managed by OneDrive), it is highly recommended to run your terminal **as an Administrator** before executing `npm start`.

## Key Dependencies

-   [Express.js](https://expressjs.com/): Backend web framework.
-   [SQLite3](https://github.com/TryGhost/node-sqlite3): For creating and managing the search index database.
-   [glob](https://github.com/isaacs/node-glob): For fast and powerful file discovery.
-   [pdf-parse](https://www.npmjs.com/package/pdf-parse): For extracting text from PDF files.
-   [mammoth](https://www.npmjs.com/package/mammoth): For converting `.docx` files to HTML/text.
-   [exceljs](https://www.npmjs.com/package/exceljs): For reading and parsing `.xlsx` files.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE.md) file for details.