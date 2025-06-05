document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
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

    const browseModeRadio = document.getElementById('browseMode');
    const searchModeRadio = document.getElementById('searchMode');
    const browseControlsSection = document.getElementById('browseControlsSection');
    const searchControlsSection = document.getElementById('searchControlsSection');
    const browseFileSelect = document.getElementById('browseFileSelect');
    const resultsHeader = document.getElementById('resultsHeader');

    // --- Constants ---
    const LOCAL_STORAGE_KEY = 'localTxtFileData_v2';
    const DEFAULT_FILES = [
        'data/Yersinia.txt',
        'data/Staphylococcus_aureus.txt',
        'data/Salmonella.txt',
        'data/Klebsiella_pneumoniae.txt', 
        'data/Escherichia_coli.txt',
        'data/Pseudomonas_aeruginosa.txt',
        'data/Enterococcus_faecium.txt',
        'data/Enterococcus_faecalis.txt', 
        'data/Neisseria_gonorrhoeae.txt',
        'data/Enterobacter.txt',
        'data/Acinetobacter_baumannii.txt'
    ];
    const FIXED_HEADER_ORDER = [
        'ruleID', 'organism', 'gene', 'nodeID', 'refseq accession', 'GenBank accession',
        'HMM accession', 'ARO accession', 'mutation', 'variation type', 'context',
        'drug', 'drug class', 'phenotype', 'clinical category', 'breakpoint',
        'breakpoint standard', 'PMID', 'evidence code', 'evidence description',
        'evidence grade', 'evidence limitations', 'rule curation note', 'Reviewed by'
    ];
    const ACCESSION_URLS = {
        'GenBank accession': 'https://www.ncbi.nlm.nih.gov/nuccore/',
        'refseq accession': 'https://www.ncbi.nlm.nih.gov/nuccore/',
        'PMID': 'https://pubmed.ncbi.nlm.nih.gov/',
        'ARO accession': 'https://card.mcmaster.ca/aro/',
        'evidence code': 'https://evidenceontology.org/term/',
        'nodeID': 'https://www.ncbi.nlm.nih.gov/pathogens/genehierarchy/',
        'HMM accession': 'https://www.ncbi.nlm.nih.gov/pathogens/hmm/#'
    };

    // --- State Variables ---
    let currentDataForDisplayAndDownload = [];
    let currentHeadersForDisplay = [];
    let sortColumnKey = '';
    let sortDirection = 'asc';

    // --- Initialization ---
    initializeApplication();

    // --- Event Listeners ---
    loadButton.addEventListener('click', () => {
        const files = fileInput.files;
        if (files.length === 0) {
            alert('Please select at least one file.');
            return;
        }
        handleFileUploads(files);
    });

    clearButton.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all loaded data (including defaults)? This will remove them from your browser\'s local storage for this page.')) {
            localStorage.removeItem(LOCAL_STORAGE_KEY);
            resetUIAfterClear();
            alert('All data cleared. Default files will need to be re-fetched if you refresh or can be re-loaded manually if needed.');
        }
    });

    browseModeRadio.addEventListener('change', handleModeChange);
    searchModeRadio.addEventListener('change', handleModeChange);
    browseFileSelect.addEventListener('change', triggerBrowse);

    searchButton.addEventListener('click', performSearch);
    searchInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') performSearch();
    });

    downloadTsvButton.addEventListener('click', () => downloadCurrentData('tsv'));
    downloadCsvButton.addEventListener('click', () => downloadCurrentData('csv'));

    // --- Core Functions ---
    async function initializeApplication() {
        let storedData = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || {};
        const defaultFileNamesInStorage = DEFAULT_FILES.filter(df => storedData[df]);
        const defaultFilesToFetch = DEFAULT_FILES.filter(df => !storedData[df]);

        if (defaultFilesToFetch.length > 0) {
            resultsCountDiv.textContent = `Loading ${defaultFilesToFetch.length} default file(s)...`;
            try {
                await Promise.all(defaultFilesToFetch.map(async (fileName) => {
                    const response = await fetch(fileName); // Assumes files are in the same directory
                    if (!response.ok) throw new Error(`Failed to fetch ${fileName}: ${response.statusText}`);
                    const content = await response.text();
                    const parsed = parseTSV(content);
                    storedData[fileName] = {
                        name: fileName,
                        content: content, // Store raw content
                        headerLineIndex: parsed.headerLineIndex,
                        headers: parsed.headers,
                        rows: parsed.rows,
                        type: 'text/plain', // Assuming
                        lastModified: new Date().toLocaleDateString() // Placeholder
                    };
                }));
                localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(storedData));
                resultsCountDiv.textContent = `Default files loaded. ${defaultFileNamesInStorage.length > 0 ? (defaultFileNamesInStorage.length + ' previously loaded default files also available.') : ''}`;
            } catch (error) {
                console.error("Error loading default files:", error);
                alert("Could not load some default files. Ensure they are in the same directory as index.html. Check console for details.");
                resultsCountDiv.textContent = "Error loading default files.";
            }
        } else if (Object.keys(storedData).length > 0) {
             resultsCountDiv.textContent = "Loaded data from previous session.";
        }


        updateUIAfterDataLoad(storedData);
        handleModeChange(); // Set initial mode and display (e.g., browse all)
    }

    function resetUIAfterClear() {
        updateLoadedFilesList([]);
        updateColumnSelector([]);
        updateBrowseFileDropdown([]);
        searchResultsDiv.innerHTML = '';
        resultsCountDiv.textContent = 'No data loaded.';
        currentDataForDisplayAndDownload = [];
        currentHeadersForDisplay = [];
        toggleDownloadButtons(false);
        // Consider if you want to immediately try to reload default files here
        // or just inform the user they will load on next refresh/visit.
        // For now, it's cleared. A refresh will trigger initializeApplication again.
    }

    function updateUIAfterDataLoad(dataObject) {
        const fileNames = Object.keys(dataObject);
        const allHeaders = new Set();
        Object.values(dataObject).forEach(fileData => {
            if (fileData.headers) {
                fileData.headers.forEach(h => allHeaders.add(h));
            }
        });

        updateLoadedFilesList(fileNames.sort());
        updateColumnSelector(Array.from(allHeaders).sort());
        updateBrowseFileDropdown(fileNames.sort());
    }
    
    function handleFileUploads(files) {
        let existingData = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || {};
        let filesProcessed = 0;
        const totalFiles = files.length;

        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const content = event.target.result;
                const parsed = parseTSV(content);
                
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
                if (filesProcessed === totalFiles) {
                    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(existingData));
                    updateUIAfterDataLoad(existingData);
                    alert(`${totalFiles} file(s) processed and stored.`);
                    fileInput.value = ''; // Reset file input
                    if (browseModeRadio.checked) {
                        triggerBrowse(); // Refresh browse view if in browse mode
                    }
                }
            };
            reader.onerror = () => {
                alert(`Error reading file: ${file.name}`);
                filesProcessed++;
                 if (filesProcessed === totalFiles) {
                    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(existingData)); // Save what was processed
                    updateUIAfterDataLoad(existingData);
                }
            };
            reader.readAsText(file);
        });
    }

    function handleModeChange() {
        sortColumnKey = ''; // Reset sort when mode changes
        sortDirection = 'asc';
        if (browseModeRadio.checked) {
            browseControlsSection.style.display = 'block';
            searchControlsSection.style.display = 'none';
            resultsHeader.textContent = 'Browse results:';
            searchInput.value = ''; // Clear search input
            triggerBrowse();
        } else { // Search mode
            browseControlsSection.style.display = 'none';
            searchControlsSection.style.display = 'block';
            resultsHeader.textContent = 'Search results:';
            searchResultsDiv.innerHTML = '<p>Enter search criteria above and click Search.</p>';
            resultsCountDiv.textContent = '';
            currentDataForDisplayAndDownload = [];
            toggleDownloadButtons(false);
        }
    }

    function triggerBrowse() {
        const selectedFileName = browseFileSelect.value;
        const storedData = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || {};
        let dataToBrowse = [];
        let distinctHeaders = new Set();

        if (Object.keys(storedData).length === 0) {
            searchResultsDiv.innerHTML = '<p>No organisms loaded to browse.</p>';
            resultsCountDiv.textContent = '';
            currentDataForDisplayAndDownload = [];
            currentHeadersForDisplay = [];
            toggleDownloadButtons(false);
            renderTable([], []); // Clear table
            return;
        }
        
        if (selectedFileName === 'all') {
            resultsHeader.textContent = 'Browsing: all loaded organisms';
            Object.values(storedData).forEach(fileData => {
                if (fileData && fileData.rows) dataToBrowse.push(...fileData.rows);
                if (fileData && fileData.headers) fileData.headers.forEach(h => distinctHeaders.add(h));
            });
        } else if (storedData[selectedFileName] && storedData[selectedFileName].rows) {
            resultsHeader.textContent = `Browsing: ${selectedFileName}`;
            dataToBrowse = storedData[selectedFileName].rows;
            if (storedData[selectedFileName].headers) {
                storedData[selectedFileName].headers.forEach(h => distinctHeaders.add(h));
            }
        }

        currentHeadersForDisplay = FIXED_HEADER_ORDER.filter(h => distinctHeaders.has(h));
        if (currentHeadersForDisplay.length === 0 && distinctHeaders.size > 0) {
            currentHeadersForDisplay = Array.from(distinctHeaders).sort();
        }
        
        currentDataForDisplayAndDownload = dataToBrowse;
        sortColumnKey = ''; // Reset sort when browsing new data
        sortDirection = 'asc';
        sortAndDisplayData(); 
        resultsCountDiv.textContent = `Displaying ${dataToBrowse.length} row(s).`;
        toggleDownloadButtons(dataToBrowse.length > 0);
    }

    function performSearch() {
        const searchTerm = searchInput.value.trim().toLowerCase();
        const selectedSearchCol = columnSelect.value; // Renamed to avoid conflict
        
        if (!searchTerm) {
            alert('Please enter a search term.');
            searchResultsDiv.innerHTML = '<p>Please enter a search term.</p>';
            resultsCountDiv.textContent = '';
            currentDataForDisplayAndDownload = [];
            currentHeadersForDisplay = [];
            toggleDownloadButtons(false);
            renderTable([], []);
            return;
        }

        const storedData = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY));
        if (!storedData || Object.keys(storedData).length === 0) {
            alert('No files loaded to search.');
            return;
        }

        let matchedRows = [];
        let distinctHeadersInMatches = new Set();

        Object.values(storedData).forEach(fileData => {
            const fileHeaders = fileData.headers || [];
            const fileRows = fileData.rows || [];

            fileRows.forEach(row => {
                let rowMatched = false;
                if (selectedSearchCol === 'all') {
                    if (Object.values(row).some(val => String(val).toLowerCase().includes(searchTerm))) {
                        rowMatched = true;
                    }
                } else {
                    if (row.hasOwnProperty(selectedSearchCol) && String(row[selectedSearchCol]).toLowerCase().includes(searchTerm)) {
                        rowMatched = true;
                    }
                }
                if (rowMatched) {
                    matchedRows.push(row);
                    fileHeaders.forEach(h => distinctHeadersInMatches.add(h));
                }
            });
        });
        
        currentHeadersForDisplay = FIXED_HEADER_ORDER.filter(h => distinctHeadersInMatches.has(h));
         if (currentHeadersForDisplay.length === 0 && distinctHeadersInMatches.size > 0) {
            currentHeadersForDisplay = Array.from(distinctHeadersInMatches).sort();
        }

        currentDataForDisplayAndDownload = matchedRows;
        sortColumnKey = ''; // Reset sort for new search
        sortDirection = 'asc';
        sortAndDisplayData();
        resultsCountDiv.textContent = `Found ${matchedRows.length} match(es).`;
        toggleDownloadButtons(matchedRows.length > 0);
        if (matchedRows.length === 0) {
             searchResultsDiv.innerHTML = '<p>No results found.</p>';
        }
    }

    function updateLoadedFilesList(fileNames) {
        loadedFilesList.innerHTML = '';
        if (fileNames.length === 0) {
            loadedFilesList.innerHTML = '<li>No files loaded.</li>';
        } else {
            fileNames.forEach(name => {
                const li = document.createElement('li');
                li.textContent = name;
                loadedFilesList.appendChild(li);
            });
        }
    }

    function updateBrowseFileDropdown(fileNames) {
        browseFileSelect.innerHTML = '<option value="all">All Loaded Files</option>';
        fileNames.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            browseFileSelect.appendChild(option);
        });
    }

    function updateColumnSelector(headers) {
        columnSelect.innerHTML = '<option value="all">All Columns</option>';
        FIXED_HEADER_ORDER.forEach(fixedHeader => {
            if (headers.includes(fixedHeader)) {
                const option = document.createElement('option');
                option.value = fixedHeader;
                option.textContent = fixedHeader;
                columnSelect.appendChild(option);
            }
        });
        headers.forEach(header => {
            if (!FIXED_HEADER_ORDER.includes(header) && header.trim() !== '') {
                const option = document.createElement('option');
                option.value = header;
                option.textContent = header;
                columnSelect.appendChild(option);
            }
        });
    }

    function parseTSV(content) {
        const lines = content.split('\n');
        let headerLineIndex = -1;
        let headers = [];

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim() !== '') {
                headerLineIndex = i;
                headers = lines[i].split('\t').map(h => h.trim());
                break;
            }
        }
        if (headerLineIndex === -1) return { headers: [], rows: [], headerLineIndex: -1 };
        
        const dataRows = lines.slice(headerLineIndex + 1);
        const rows = dataRows.map(line => {
            const values = line.split('\t');
            const rowObject = {};
            headers.forEach((header, index) => {
                rowObject[header] = values[index] ? values[index].trim() : '';
            });
            return rowObject;
        }).filter(row => Object.values(row).some(val => val && String(val).trim() !== ''));
        return { headers, rows, headerLineIndex };
    }
    
    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') {
            unsafe = String(unsafe); // Ensure it's a string
        }
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }

  function generateLink(headerKey, value) {
        const sValue = String(value);
        if (!sValue || sValue === '-' || sValue.trim() === '') {
            return sValue; // Return original non-values as is
        }

        const baseUrl = ACCESSION_URLS[headerKey];
        if (baseUrl) {
            // Modified: Add replace to remove surrounding double quotes from IDs
            const ids = sValue.split(/[,;\s]+/).map(id => id.trim().replace(/^"|"$/g, '')).filter(id => id);

            const buildLinkTag = (displayAndProcessValue) => {
                let suffixPart = displayAndProcessValue; // This will be processed for the URL

                if (headerKey === 'ARO accession' && displayAndProcessValue.startsWith('ARO:')) {
                    suffixPart = displayAndProcessValue.substring(4);
                } else if (headerKey === 'HMM accession' && displayAndProcessValue.includes('.')) {
                    suffixPart = displayAndProcessValue;
                }

                let urlSuffix;
                if (headerKey === 'evidence code' && displayAndProcessValue.startsWith('ECO:')) {
                    urlSuffix = suffixPart; // Use as-is, not encoded, per original implicit logic
                    suffixPart = displayAndProcessValue.substring(4);
                } else {
                    urlSuffix = encodeURIComponent(suffixPart);
                    // Ensure colons are not encoded in the final URL suffix
                    urlSuffix = urlSuffix.replace(/%3A/g, ':');
                }

            if (headerKey === 'PMID') {

                }
                // Link text is the original displayAndProcessValue, HTML escaped.
                return `<a href="${baseUrl}${urlSuffix}" target="_blank">${escapeHtml(displayAndProcessValue)}</a>`;
            };

            if (ids.length > 1) { // Multiple distinct IDs found
                return ids.map(id => buildLinkTag(id)).join(', ');
            } else { // Single ID or original sValue if no (or one) ID was parsed
                return buildLinkTag(sValue);
            }
        }
        return escapeHtml(sValue); // Fallback: return value, HTML escaped for safety in table
    }


    function sortAndDisplayData() {
        let dataToDisplay = [...currentDataForDisplayAndDownload];

        if (sortColumnKey && currentHeadersForDisplay.includes(sortColumnKey)) {
            dataToDisplay.sort((a, b) => {
                let valA = String(a[sortColumnKey] || '');
                let valB = String(b[sortColumnKey] || '');

                const numA = parseFloat(valA);
                const numB = parseFloat(valB);

                let compareResult;
                if (!isNaN(numA) && !isNaN(numB) && valA.match(/^[\d.-]+$/) && valB.match(/^[\d.-]+$/)) { // Check if they are purely numeric strings
                    compareResult = numA - numB;
                } else {
                    compareResult = valA.toLowerCase().localeCompare(valB.toLowerCase());
                }

                return sortDirection === 'asc' ? compareResult : -compareResult;
            });
        }
        renderTable(currentHeadersForDisplay, dataToDisplay);
    }
    
    function renderTable(headers, rowsData) {
        searchResultsDiv.innerHTML = '';
        if (!headers || headers.length === 0) {
             if (browseModeRadio.checked && currentDataForDisplayAndDownload.length > 0) {
                searchResultsDiv.innerHTML = '<p>No common headers found for selected data, or headers configuration issue.</p>';
            } else if (!browseModeRadio.checked && currentDataForDisplayAndDownload.length > 0) {
                 searchResultsDiv.innerHTML = '<p>No headers defined for search results.</p>';
            }
            // If no data at all, specific messages are handled by callers.
            return;
        }


        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');

        headers.forEach(headerKey => {
            const th = document.createElement('th');
            th.textContent = headerKey;
            th.dataset.columnKey = headerKey;

            const arrowSpan = document.createElement('span');
            arrowSpan.classList.add('sort-arrow');
            if (headerKey === sortColumnKey) {
                th.classList.add(sortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
                arrowSpan.innerHTML = sortDirection === 'asc' ? ' ↑' : ' ↓';
            }
            th.appendChild(arrowSpan);
            
            th.addEventListener('click', () => {
                if (sortColumnKey === headerKey) {
                    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    sortColumnKey = headerKey;
                    sortDirection = 'asc';
                }
                sortAndDisplayData();
            });
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        const fragment = document.createDocumentFragment(); // For performance
        if (rowsData.length > 0) {
            rowsData.forEach(rowDataItem => {
                const rowElement = document.createElement('tr');
                headers.forEach(headerKey => {
                    const td = document.createElement('td');
                    const cellValue = rowDataItem[headerKey] === undefined ? '' : rowDataItem[headerKey];
                    td.innerHTML = generateLink(headerKey, cellValue);
                    rowElement.appendChild(td);
                });
                fragment.appendChild(rowElement);
            });
        }
        tbody.appendChild(fragment);
        table.appendChild(tbody);
        searchResultsDiv.appendChild(table);

        if (rowsData.length === 0 && browseModeRadio.checked) {
             resultsCountDiv.textContent = `Displaying 0 rows. ${ (browseFileSelect.value !== 'all' && Object.keys(JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || {}).length > 0) ? 'Selected file might be empty or header-only.' : ''}`;
        } else if (rowsData.length === 0 && searchModeRadio.checked) {
            resultsCountDiv.textContent = "Found 0 match(es)."
            // No specific message here, performSearch handles it
        }

    }

    function toggleDownloadButtons(enable) {
        downloadTsvButton.disabled = !enable;
        downloadCsvButton.disabled = !enable;
    }

    function downloadCurrentData(format) {
        if (currentDataForDisplayAndDownload.length === 0) {
            alert("No data to download.");
            return;
        }
        
        const headersForDownload = currentHeadersForDisplay;
        const separator = format === 'tsv' ? '\t' : ',';
        let content = headersForDownload.map(h => (format === 'csv' ? `"${String(h).replace(/"/g, '""')}"` : String(h))).join(separator) + '\n';

        currentDataForDisplayAndDownload.forEach(rowItem => {
            const rowValues = headersForDownload.map(headerKey => {
                let value = rowItem[headerKey] === undefined ? '' : rowItem[headerKey];
                if (format === 'csv') value = `"${String(value).replace(/"/g, '""')}"`;
                return value;
            });
            content += rowValues.join(separator) + '\n';
        });

        const blob = new Blob([content], { type: `text/${format === 'tsv' ? 'tab-separated-values' : 'csv'};charset=utf-8;` });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `amrrules_data.${format}`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
});