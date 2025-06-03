document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const loadButton = document.getElementById('loadButton');
    const clearButton = document.getElementById('clearButton');
    const searchInput = document.getElementById('searchInput');
    const columnSelect = document.getElementById('columnSelect');
    const searchButton = document.getElementById('searchButton');
    const loadedFilesList = document.getElementById('loadedFilesList');
    const searchResultsDiv = document.getElementById('searchResults');
    const resultsCountDiv = document.getElementById('resultsCount');
    const downloadTsvButton = document.getElementById('downloadTsvButton');
    const downloadCsvButton = document.getElementById('downloadCsvButton');

    const LOCAL_STORAGE_KEY = 'localTxtFileData';
    let currentSearchResults = []; // To store results for download

    // Load data from local storage on page load
    loadFilesFromStorageAndSetup();

    loadButton.addEventListener('click', () => {
        const files = fileInput.files;
        if (files.length === 0) {
            alert('Please select at least one file.');
            return;
        }
        storeFiles(files);
    });

    clearButton.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all loaded data?')) {
            localStorage.removeItem(LOCAL_STORAGE_KEY);
            updateLoadedFilesList([]);
            updateColumnSelector([]);
            searchResultsDiv.innerHTML = '';
            resultsCountDiv.textContent = '';
            currentSearchResults = [];
            toggleDownloadButtons(false);
            alert('Data cleared from local storage.');
        }
    });

    searchButton.addEventListener('click', performSearch);
    searchInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            performSearch();
        }
    });

    downloadTsvButton.addEventListener('click', () => downloadResults('tsv'));
    downloadCsvButton.addEventListener('click', () => downloadResults('csv'));

    function storeFiles(files) {
        let existingData = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || {};
        let filesProcessed = 0;
        const allHeaders = new Set();

        // Collect existing headers
        Object.values(existingData).forEach(fileData => {
            if (fileData.headers) {
                fileData.headers.forEach(h => allHeaders.add(h));
            }
        });

        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const content = event.target.result;
                const parsed = parseTSV(content);
                parsed.headers.forEach(h => allHeaders.add(h));

                existingData[file.name] = {
                    name: file.name,
                    content: content, // Store raw content
                    headers: parsed.headers, // Store parsed headers
                    rows: parsed.rows,       // Store parsed rows
                    type: file.type,
                    lastModified: file.lastModifiedDate ? file.lastModifiedDate.toLocaleDateString() : 'N/A'
                };
                filesProcessed++;
                if (filesProcessed === files.length) {
                    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(existingData));
                    updateLoadedFilesList(Object.keys(existingData));
                    updateColumnSelector(Array.from(allHeaders));
                    alert(`${files.length} file(s) loaded and stored.`);
                    fileInput.value = ''; // Clear the file input
                }
            };
            reader.onerror = () => {
                alert(`Error reading file: ${file.name}`);
                filesProcessed++;
                 if (filesProcessed === files.length) { // still update storage if some files fail
                    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(existingData));
                    updateLoadedFilesList(Object.keys(existingData));
                    updateColumnSelector(Array.from(allHeaders));
                }
            };
            reader.readAsText(file);
        });
    }

    function loadFilesFromStorageAndSetup() {
        const data = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY));
        const allHeaders = new Set();
        if (data) {
            Object.values(data).forEach(fileData => {
                if (fileData.headers) { // Check if headers were stored (for backward compatibility)
                    fileData.headers.forEach(h => allHeaders.add(h));
                } else { // If old format, parse now
                    const parsed = parseTSV(fileData.content);
                    fileData.headers = parsed.headers;
                    fileData.rows = parsed.rows;
                    parsed.headers.forEach(h => allHeaders.add(h));
                }
            });
            // Resave with parsed data if it was missing
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));

            updateLoadedFilesList(Object.keys(data));
            updateColumnSelector(Array.from(allHeaders));
        } else {
            updateLoadedFilesList([]);
            updateColumnSelector([]);
        }
    }

    function updateLoadedFilesList(fileNames) {
        loadedFilesList.innerHTML = '';
        if (fileNames.length === 0) {
            const li = document.createElement('li');
            li.textContent = 'No files loaded.';
            loadedFilesList.appendChild(li);
        } else {
            fileNames.forEach(name => {
                const li = document.createElement('li');
                li.textContent = name;
                loadedFilesList.appendChild(li);
            });
        }
    }

    function updateColumnSelector(headers) {
        columnSelect.innerHTML = '<option value="all">All Columns</option>'; // Reset
        headers.sort().forEach(header => {
            if (header.trim() !== '') {
                const option = document.createElement('option');
                option.value = header;
                option.textContent = header;
                columnSelect.appendChild(option);
            }
        });
    }


    function parseTSV(content) {
        const lines = content.split('\n');
        // Ensure the first line (headers) is not empty or just whitespace
        const headerLineIndex = lines.findIndex(line => line.trim() !== '');
        if (headerLineIndex === -1) return { headers: [], rows: [] }; // No content

        const headers = lines[headerLineIndex].split('\t').map(h => h.trim());
        const dataRows = lines.slice(headerLineIndex + 1);

        const rows = dataRows.map(line => {
            const values = line.split('\t');
            const rowObject = {};
            headers.forEach((header, index) => {
                rowObject[header] = values[index] ? values[index].trim() : '';
            });
            return rowObject;
        }).filter(row => Object.values(row).some(val => val !== '')); // Filter out completely empty rows

        return { headers, rows };
    }


    function performSearch() {
        const searchTerm = searchInput.value.trim().toLowerCase();
        const selectedColumn = columnSelect.value;
        searchResultsDiv.innerHTML = '';
        resultsCountDiv.textContent = '';
        currentSearchResults = [];

        if (!searchTerm) {
            alert('Please enter a search term.');
            toggleDownloadButtons(false);
            return;
        }

        const storedData = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY));
        if (!storedData || Object.keys(storedData).length === 0) {
            alert('No files loaded to search.');
            toggleDownloadButtons(false);
            return;
        }

        let matchesCount = 0;

        for (const fileName in storedData) {
            if (storedData.hasOwnProperty(fileName)) {
                const fileData = storedData[fileName];
                const fileHeaders = fileData.headers || []; // Use stored headers
                const fileRows = fileData.rows || [];     // Use stored rows

                // Search headers if "All Columns" or if the selected column itself matches
                if (selectedColumn === 'all') {
                    if (fileHeaders.some(header => header.toLowerCase().includes(searchTerm))) {
                        currentSearchResults.push({
                            fileName: fileName,
                            isHeader: true,
                            headers: fileHeaders, // For download
                            matchedContent: fileHeaders.join('\t'),
                            lineNumber: 1 // Or actual line number if available
                        });
                        matchesCount++;
                    }
                } else if (selectedColumn.toLowerCase().includes(searchTerm) && fileHeaders.includes(selectedColumn)) {
                     currentSearchResults.push({
                        fileName: fileName,
                        isHeader: true,
                        headers: fileHeaders,
                        matchedContent: fileHeaders.join('\t'),
                        lineNumber: 1
                    });
                    matchesCount++;
                }


                // Search rows
                fileRows.forEach((row, rowIndex) => {
                    let rowMatched = false;
                    if (selectedColumn === 'all') {
                        // Search in all values of the row
                        if (Object.values(row).some(val => val.toLowerCase().includes(searchTerm))) {
                            rowMatched = true;
                        }
                    } else {
                        // Search only in the selected column
                        if (row.hasOwnProperty(selectedColumn) && row[selectedColumn].toLowerCase().includes(searchTerm)) {
                            rowMatched = true;
                        }
                    }

                    if (rowMatched) {
                        currentSearchResults.push({
                            fileName: fileName,
                            isHeader: false,
                            headers: fileHeaders, // For download context
                            rowData: row, // Store the row object
                            lineNumber: rowIndex + 2 // +1 for header line, +1 for 0-based index
                        });
                        matchesCount++;
                    }
                });
            }
        }

        displayResults(currentSearchResults, searchTerm, selectedColumn);
        resultsCountDiv.textContent = `Found ${matchesCount} match(es).`;
        toggleDownloadButtons(matchesCount > 0);
        if (matchesCount === 0) {
             searchResultsDiv.innerHTML = '<p>No results found.</p>';
        }
    }

    function displayResults(results, searchTerm, selectedColumn) {
        searchResultsDiv.innerHTML = ''; // Clear previous results
        results.forEach(result => {
            const itemDiv = document.createElement('div');
            itemDiv.classList.add('result-item');

            const fileInfo = document.createElement('p');
            fileInfo.innerHTML = `Found in: <strong>${result.fileName}</strong> (Line: ${result.lineNumber})`;
            itemDiv.appendChild(fileInfo);

            const contentPre = document.createElement('pre');
            let displayContent;

            if (result.isHeader) {
                displayContent = result.headers.join('\t');
            } else {
                // Construct the original TSV line from rowData and headers
                displayContent = result.headers.map(header => result.rowData[header] || '').join('\t');
            }

            if (searchTerm) {
                const regex = new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi');
                if (selectedColumn === 'all' || result.isHeader) {
                    displayContent = displayContent.replace(regex, '<span class="highlight">$1</span>');
                } else if (result.rowData && result.rowData.hasOwnProperty(selectedColumn)) {
                    // Highlight only in the specific column for row data if column is selected
                    // This is tricky for pre-formatted text. Simpler to highlight full line if any part matches.
                    // For more precise column highlighting, would need to render as a table or similar.
                    // For now, stick to highlighting the search term anywhere in the displayed line.
                     displayContent = displayContent.replace(regex, '<span class="highlight">$1</span>');
                }
            }
            contentPre.innerHTML = displayContent;
            itemDiv.appendChild(contentPre);
            searchResultsDiv.appendChild(itemDiv);
        });
    }

    function toggleDownloadButtons(enable) {
        downloadTsvButton.disabled = !enable;
        downloadCsvButton.disabled = !enable;
    }

    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function downloadResults(format) {
        if (currentSearchResults.length === 0) {
            alert("No results to download.");
            return;
        }

        let content = '';
        let universalHeaders = new Set(['SourceFile', 'OriginalLineNumber']);
        let fileSpecificHeaders = new Map(); // To store headers per file

        // First pass to get all unique headers from results
        currentSearchResults.forEach(result => {
            if (result.headers) {
                result.headers.forEach(h => universalHeaders.add(h));
                if (!fileSpecificHeaders.has(result.fileName)) {
                    fileSpecificHeaders.set(result.fileName, result.headers);
                }
            }
        });
        const sortedHeaders = Array.from(universalHeaders);
        // Ensure SourceFile and OriginalLineNumber are first if they exist
        const fixedHeaders = ['SourceFile', 'OriginalLineNumber']
                               .filter(h => sortedHeaders.includes(h))
                               .concat(sortedHeaders.filter(h => !['SourceFile', 'OriginalLineNumber'].includes(h)));


        const separator = format === 'tsv' ? '\t' : ',';
        content += fixedHeaders.map(h => (format === 'csv' ? `"${h.replace(/"/g, '""')}"` : h)).join(separator) + '\n';

        currentSearchResults.forEach(result => {
            const rowValues = [];
            fixedHeaders.forEach(header => {
                let value = '';
                if (header === 'SourceFile') {
                    value = result.fileName;
                } else if (header === 'OriginalLineNumber') {
                    value = result.lineNumber;
                } else if (result.isHeader) {
                    // If it's a header match, the "value" for other columns could be empty or the header itself if it matches
                    value = result.headers.includes(header) ? header : '';
                } else if (result.rowData && result.rowData.hasOwnProperty(header)) {
                    value = result.rowData[header];
                }

                if (format === 'csv') {
                    value = `"${(value || '').toString().replace(/"/g, '""')}"`;
                }
                rowValues.push(value);
            });
            content += rowValues.join(separator) + '\n';
        });

        const blob = new Blob([content], { type: `text/${format === 'tsv' ? 'tab-separated-values' : 'csv'};charset=utf-8;` });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `search_results.${format}`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
});