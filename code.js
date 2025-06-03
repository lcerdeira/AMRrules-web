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

        // --- Define the desired fixed header order for display and download ---
    const FIXED_HEADER_ORDER = [
        'ruleID',
        'organism',
        'gene',
        'nodeID',
        'refseq accession',
        'GenBank accession',
        'HMM accession',
        'ARO accession',
        'mutation',
        'variation type',
        'context',
        'drug',
        'drug class',
        'phenotype',
        'clinical category',
        'breakpoint',
        'breakpoint standard',
        'PMID',
        'evidence code',
        'evidence description',
        'evidence grade',
        'evidence limitations',
        'rule curation note'
    ];

    // --- URLs for Hyperlinks ---
    const ACCESSION_URLS = {
        'GenBank accession': 'https://www.ncbi.nlm.nih.gov/nuccore/',
        'refseq accession': 'https://www.ncbi.nlm.nih.gov/nuccore/',
        'PMID': 'https://pubmed.ncbi.nlm.nih.gov/',
        'ARO accession': 'https://card.mcmaster.ca/aro/',
        'evidence code': 'https://evidenceontology.org/term/', // Or https://www.ebi.ac.uk/QuickGO/term/ if ECO codes
    };

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
            // Clear sort column select if it exists (though it shouldn't with this change)
            const sortSelect = document.getElementById('sortColumnSelect');
            if (sortSelect) sortSelect.innerHTML = '<option value="">Select Column to Sort</option>';

            resultsCountDiv.textContent = '';
            currentSearchResults = [];
            toggleDownloadButtons(false);
            alert('Data cleared from local storage.');
        }
    });

    // Event listeners
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
                    content: content,
                    headerLineIndex: parsed.headerLineIndex,
                    headers: parsed.headers,
                    rows: parsed.rows,
                    type: file.type,
                    lastModified: file.lastModifiedDate ? file.lastModifiedDate.toLocaleDateString() : 'N/A'
                };
                filesProcessed++;
                if (filesProcessed === files.length) {
                    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(existingData));
                    updateLoadedFilesList(Object.keys(existingData));
                    updateColumnSelector(Array.from(allHeaders));
                    alert(`${files.length} file(s) loaded and stored.`);
                    fileInput.value = '';
                }
            };
            reader.onerror = () => {
                alert(`Error reading file: ${file.name}`);
                filesProcessed++;
                 if (filesProcessed === files.length) {
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
                if (fileData.headers && fileData.rows) {
                    fileData.headers.forEach(h => allHeaders.add(h));
                } else {
                    const parsed = parseTSV(fileData.content);
                    fileData.headers = parsed.headers;
                    fileData.rows = parsed.rows;
                    fileData.headerLineIndex = parsed.headerLineIndex;
                    parsed.headers.forEach(h => allHeaders.add(h));
                }
            });
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
        columnSelect.innerHTML = '<option value="all">All Columns</option>';
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
        const headerLineIndex = lines.findIndex(line => line.trim() !== '');
        if (headerLineIndex === -1) return { headers: [], rows: [], headerLineIndex: -1 };

        const headers = lines[headerLineIndex].split('\t').map(h => h.trim());
        const dataRows = lines.slice(headerLineIndex + 1);

        const rows = dataRows.map(line => {
            const values = line.split('\t');
            const rowObject = {};
            headers.forEach((header, index) => {
                rowObject[header] = values[index] ? values[index].trim() : '';
            });
            return rowObject;
        }).filter(row => Object.values(row).some(val => val && val.trim() !== ''));
        return { headers, rows, headerLineIndex };
    }

    // Helper function to get headers for display/download based on loaded files
    function getHeadersForOutput() {
        const storedData = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || {};
        const allLoadedHeadersSet = new Set();
        Object.values(storedData).forEach(fileData => {
            if (fileData.headers) {
                fileData.headers.forEach(h => allLoadedHeadersSet.add(h));
            }
        });
        return FIXED_HEADER_ORDER.filter(fixedHeader => allLoadedHeadersSet.has(fixedHeader));
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
                const fileHeaders = fileData.headers || [];
                const fileRows = fileData.rows || [];
                const fileHeaderLineIndex = fileData.headerLineIndex;

                if (selectedColumn === 'all') {
                    if (fileHeaders.some(header => header.toLowerCase().includes(searchTerm))) {
                        currentSearchResults.push({
                            fileName: fileName,
                            isHeader: true,
                            headers: fileHeaders,
                            matchedContent: fileHeaders.join('\t'),
                            lineNumber: fileHeaderLineIndex !== undefined ? fileHeaderLineIndex + 1 : 1
                        });
                        matchesCount++;
                    }
                } else if (fileHeaders.includes(selectedColumn) && selectedColumn.toLowerCase().includes(searchTerm)) {
                     currentSearchResults.push({
                        fileName: fileName,
                        isHeader: true,
                        headers: fileHeaders,
                        matchedContent: fileHeaders.join('\t'),
                        lineNumber: fileHeaderLineIndex !== undefined ? fileHeaderLineIndex + 1 : 1
                    });
                    matchesCount++;
                }

                fileRows.forEach((row, rowIndex) => {
                    let rowMatched = false;
                    if (selectedColumn === 'all') {
                        if (Object.values(row).some(val => val.toLowerCase().includes(searchTerm))) {
                            rowMatched = true;
                        }
                    } else {
                        if (row.hasOwnProperty(selectedColumn) && row[selectedColumn].toLowerCase().includes(searchTerm)) {
                            rowMatched = true;
                        }
                    }

                    if (rowMatched) {
                        currentSearchResults.push({
                            fileName: fileName,
                            isHeader: false,
                            headers: fileHeaders,
                            rowData: row,
                            lineNumber: fileHeaderLineIndex !== undefined ? fileHeaderLineIndex + rowIndex + 2 : rowIndex + 2
                        });
                        matchesCount++;
                    }
                });
            }
        }

        displayResults(currentSearchResults);
        resultsCountDiv.textContent = `Found ${matchesCount} match(es).`;
        toggleDownloadButtons(matchesCount > 0);
        if (matchesCount === 0) {
             searchResultsDiv.innerHTML = '<p>No results found.</p>';
        }
    }

    function generateLink(header, value) {
        if (!value || value === '-' || value.trim() === '') {
            return value;
        }
        const baseUrl = ACCESSION_URLS[header];
        if (baseUrl) {
            // Handle multiple values separated by common delimiters like ',' or ';'
            const ids = value.split(/[,;\s*]+/).map(id => id.trim()).filter(id => id);
            if (ids.length > 1) {
                return ids.map(id => {
                    let idLink = id;
                    if (header === 'ARO accession' && id.includes(':')) { // Specific handling for ARO accessions
                        idLink = `<a href="${baseUrl}${id.replace("ARO:", "")}" target="_blank">${id}</a>`;
                    } else if (header === 'evidence code' && id.includes(':')) { // Specific handling for evidence codes (e.g., ECO:0000269)
                         idLink = `<a href="${baseUrl}${id.replace("ECO:", "ECO:")}" target="_blank">${id}</a>`;
                    } else {
                        idLink = `<a href="${baseUrl}${encodeURIComponent(id)}">${id}</a>`;

                    }
                    return idLink;
                }).join(', '); // Join multiple links with a ; and space
            } else { // Single value
                 if (header === 'ARO accession' && value.includes(':')) {
                     return `<a href="${baseUrl}${value.replace("ARO:", "")}" target="_blank">${value}</a>`;
                 }
                 if (header === 'evidence code' && value.includes(':')) {
                     return `<a href="${baseUrl}${value.replace("ECO:", "ECO:")}" target="_blank">${value}</a>`;
                 }
                return `<a href="${baseUrl}${encodeURIComponent(value)}">${value}</a>`;
            }
        }
        return value;
    }

    function displayResults(results) {
        searchResultsDiv.innerHTML = '';
        if (results.length === 0) {
            searchResultsDiv.innerHTML = '<p>No results found.</p>';
            return;
        }
        
        const headersToDisplay = getHeadersForOutput();
        
        const table = document.createElement('table');
        table.classList.add('results-table');

        // Create table header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        headersToDisplay.forEach(headerText => { // Use the headers determined for display
            const th = document.createElement('th');
            th.textContent = headerText; // Use the header from the filtered list
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Create table body
        const tbody = document.createElement('tbody');
        const fragment = document.createDocumentFragment();

        results.forEach(result => {
            const rowElement = document.createElement('tr');
            
        // Add data cells based on the headers to display
        headersToDisplay.forEach(header => {
            const td = document.createElement('td');
            // Get cell value from rowData if it's a data row, or header text if it's a header row match
            const cellValue = result.isHeader ? (result.headers.includes(header) ? header : '') : (result.rowData[header]);
            td.innerHTML = generateLink(header, cellValue); // Use innerHTML to render links
            rowElement.appendChild(td);
            });
            fragment.appendChild(rowElement);
        });
        tbody.appendChild(fragment);
        table.appendChild(tbody);
        searchResultsDiv.appendChild(table);
    }

    function toggleDownloadButtons(enable) {
        downloadTsvButton.disabled = !enable;
        downloadCsvButton.disabled = !enable;
    }

    function downloadResults(format) {
        if (currentSearchResults.length === 0) {
            alert("No results to download.");
            return;
        }
        
        const headersForDownload = getHeadersForOutput();
        const separator = format === 'tsv' ? '\t' : ',';
        let content = headersForDownload.map(h => (format === 'csv' ? `"${h.replace(/"/g, '""')}"` : h)).join(separator) + '\n';

        currentSearchResults.forEach(result => {
            const rowValues = [];
            headersForDownload.forEach(header => {
                let value = '';
                // Get cell value from rowData if it's a data row, or header text if it's a header row match
                value = result.isHeader ? (result.headers.includes(header) ? header : '') : (result.rowData[header] || ''); // Use || '' to handle undefined
                if (format === 'csv') value = `"${(value || '').toString().replace(/"/g, '""')}"`;
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
        URL.revokeObjectURL(url); // Clean up
    }
});