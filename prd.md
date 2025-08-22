1. Responsive UI / Optimistic UI Design with AJAX
2. Universal search for filenames and content in the selected/set folder by default
    2a. Search should be case insensitive
    2b. Instant results while typing (dynamic search)
    2c. Content search using index
3. Preview button must work for all common filetypes and should show a native file preview
4. Content Search should search within the contents of the file using an index file 
    4a. Deep search (a.k.a content search) should ALWAYS make use of the index file and results should be instant (or within 2-3 seconds max). Indexing should recursively look for files in subfolders too.
    4b. Indexing status and progress in % must be displayed in its own dedicated coloured rounded corner pill 
    4c. If indexing is complete for less than 50% of files, it should be shown in orange fill, if >50% but less than 99%, in dark yellow, if 100% , then deep green
5. All UI elements on the page must have a dark outline and colours should be CMYK only