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

    // --- URLs for Hyperlinks ---
    const ACCESSION_URLS = {
        'GenBank accession': 'https://www.ncbi.nlm.nih.gov/nuccore/',
        'refseq accession': 'https://www.ncbi.nlm.nih.gov/nuccore/',
        'PMID': 'https://pubmed.ncbi.nlm.nih.gov/',
        // HMM accession: No standard central public URL, depends on the source (e.g., Pfam, TIGRFAMs)
        // For demonstration, assuming a generic placeholder or a specific one if known.
        // If HMM accessions are from a specific DB like Pfam, use that. e.g., https://pfam.xfam.org/family/
        'HMM accession': 'https://www.ebi.ac.uk/interpro/search/sequence/', // Example: InterPro search
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
        if (headerLineIndex === -1) return { headers: [], rows: [] };

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
                const fileHeaders = fileData.headers || [];
                const fileRows = fileData.rows || [];

                if (selectedColumn === 'all') {
                    if (fileHeaders.some(header => header.toLowerCase().includes(searchTerm))) {
                        currentSearchResults.push({
                            fileName: fileName,
                            isHeader: true,
                            headers: fileHeaders,
                            matchedContent: fileHeaders.join('\t'),
                            lineNumber: 1 // Placeholder, actual line number might vary if file has empty lines at top
                        });
                        matchesCount++;
                    }
                } else if (fileHeaders.includes(selectedColumn) && selectedColumn.toLowerCase().includes(searchTerm)) {
                     currentSearchResults.push({
                        fileName: fileName,
                        isHeader: true,
                        headers: fileHeaders,
                        matchedContent: fileHeaders.join('\t'),
                        lineNumber: 1
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
                            lineNumber: rowIndex + 2 // Adjust if actual line numbers are tracked from raw content
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

    function generateLink(header, value) {
        if (!value || value === '-' || value.trim() === '') {
            return value; // Return original value if no actual ID
        }
        const baseUrl = ACCESSION_URLS[header];
        if (baseUrl) {
            // Special handling for evidence codes if they are like ECO:0000000
            if (header === 'evidence code' && value.includes(':')) {
                 return `<a href="${baseUrl}${value.replace(":", "_")}" target="_blank">${value}</a>`;
            }
            return `<a href="${baseUrl}${encodeURIComponent(value)}" target="_blank">${value}</a>`;
        }
        return value; // No link if header not in ACCESSION_URLS
    }

    function displayResults(results, searchTerm, selectedColumn) {
        searchResultsDiv.innerHTML = '';
        const fragment = document.createDocumentFragment();

        results.forEach(result => {
            const itemDiv = document.createElement('div');
            itemDiv.classList.add('result-item');

            const fileInfo = document.createElement('p');
            fileInfo.innerHTML = `Found in: <strong>${result.fileName}</strong> (Original Line: ${result.lineNumber})`;
            itemDiv.appendChild(fileInfo);

            const contentPre = document.createElement('pre');
            let displayHTML = '';

            if (result.isHeader) {
                displayHTML = result.headers.map(header => {
                    let headerText = header;
                    if (searchTerm && header.toLowerCase().includes(searchTerm.toLowerCase())) {
                        const regex = new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi');
                        headerText = header.replace(regex, '<span class="highlight">$1</span>');
                    }
                    return headerText;
                }).join('\t');
            } else {
                // For data rows, construct the display string with potential links
                displayHTML = result.headers.map(header => {
                    const originalValue = result.rowData[header] || '';
                    let cellDisplay = generateLink(header, originalValue); // Generate link if applicable

                    // Highlight if searchTerm matches, being careful not to mess up HTML from generateLink
                    if (searchTerm && originalValue.toLowerCase().includes(searchTerm.toLowerCase())) {
                        const regex = new RegExp(escapeRegExp(searchTerm), 'gi');
                        // If it's already a link, highlight within the link text
                        if (cellDisplay.startsWith('<a')) {
                            cellDisplay = cellDisplay.replace(/>([^<]+)</, (match, linkText) => {
                                return `>${linkText.replace(regex, '<span class="highlight">$&</span>')}<`;
                            });
                        } else {
                           cellDisplay = cellDisplay.replace(regex, '<span class="highlight">$&</span>');
                        }
                    }
                    return cellDisplay; // This now might contain HTML
                }).join('\t'); // Still using tab for pre formatting, but cells might be links
            }

            contentPre.innerHTML = displayHTML; // Use innerHTML because displayHTML can contain HTML tags
            itemDiv.appendChild(contentPre);
            fragment.appendChild(itemDiv);
        });
        searchResultsDiv.appendChild(fragment);
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

        let universalHeaders = new Set(['SourceFile', 'OriginalLineNumber']);
        currentSearchResults.forEach(result => {
            if (result.headers) result.headers.forEach(h => universalHeaders.add(h));
        });

        const sortedHeaders = Array.from(universalHeaders);
        const fixedHeaders = ['SourceFile', 'OriginalLineNumber']
            .filter(h => sortedHeaders.includes(h))
            .concat(sortedHeaders.filter(h => !['SourceFile', 'OriginalLineNumber'].includes(h)));

        const separator = format === 'tsv' ? '\t' : ',';
        let content = fixedHeaders.map(h => (format === 'csv' ? `"${h.replace(/"/g, '""')}"` : h)).join(separator) + '\n';

        currentSearchResults.forEach(result => {
            const rowValues = [];
            fixedHeaders.forEach(header => {
                let value = '';
                if (header === 'SourceFile') value = result.fileName;
                else if (header === 'OriginalLineNumber') value = result.lineNumber;
                else if (result.isHeader) value = result.headers.includes(header) ? header : '';
                else if (result.rowData && result.rowData.hasOwnProperty(header)) value = result.rowData[header];

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