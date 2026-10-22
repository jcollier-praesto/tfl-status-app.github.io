import { escapeHtml, haversineDistance, isWithinCommuteWindow, normalizeJourneyOptions, normalizePreferences, sortLines } from './app-utils.mjs?v=6';
import { LINE_STATION_NODES, TFL_LINES } from './app-data.mjs?v=6';

// App State
        let tubeDataRaw = [];
        const storedPreferences = normalizePreferences(readStoredJson('tfl_preferences', {}));
        const storedPinnedLines = readStoredJson('tfl_pinned_lines', ['victoria', 'northern']);
        let userLocation = storedPreferences.origin;
        let destinationLocation = storedPreferences.destination;
        let pinnedLines = new Set(Array.isArray(storedPinnedLines)
            ? storedPinnedLines.filter(lineId => typeof lineId === 'string' && TFL_LINES[lineId])
            : ['victoria', 'northern']);
        let distanceUnit = storedPreferences.distanceUnit === 'miles' ? 'miles' : 'km';
        let nearbyLineStations = LINE_STATION_NODES;
        let expandedArrivals = new Set();
        let expandedDisruptions = new Set();
        let liveArrivalsCache = {};
        let refreshCountdownVal = 60;
        let countdownTimer = null;
        let journeyRequestId = 0;

        function readStoredJson(key, fallback) {
            try {
                const value = localStorage.getItem(key);
                return value ? JSON.parse(value) : fallback;
            } catch (error) {
                console.warn(`Unable to read saved ${key}:`, error);
                return fallback;
            }
        }

        function readStoredValue(key) {
            try {
                return localStorage.getItem(key);
            } catch (error) {
                console.warn(`Unable to read saved ${key}:`, error);
                return null;
            }
        }

        function removeStoredValue(key) {
            try {
                localStorage.removeItem(key);
            } catch (error) {
                console.warn(`Unable to remove saved ${key}:`, error);
            }
        }

        function saveStoredValue(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch (error) {
                console.warn(`Unable to save ${key}:`, error);
                showToast('Your browser could not save this preference.', 'error');
            }
        }

        function savePreferences() {
            saveStoredValue('tfl_preferences', {
                origin: userLocation,
                destination: destinationLocation,
                distanceUnit,
                theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light'
            });
        }

        // Initialize Application & Service Worker
        window.addEventListener('DOMContentLoaded', () => {
            initTheme();
            document.getElementById('current-location-label').innerText = userLocation.name;
            updateJourneyOriginLabel();
            if (destinationLocation) {
                document.getElementById('destination-input').value = destinationLocation.name;
                planJourney();
            }
            setDistanceUnit(distanceUnit, false);
            loadAlertSettings();
            document.getElementById('offline-banner').classList.toggle('hidden', navigator.onLine);
            document.getElementById('alert-modal').addEventListener('keydown', handleAlertModalKeydown);
            document.getElementById('alert-modal').addEventListener('click', event => {
                if (event.target.id === 'alert-modal') closeAlertModal();
            });
            registerServiceWorker();
            loadNearbyStations();
            fetchTubeStatuses();
            startRefreshTimer();
            checkCommuteAlerts();
        });

        function registerServiceWorker() {
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('./sw.js')
                    .catch(error => {
                        console.error('Service worker registration failed:', error);
                        showToast('Offline app support could not be enabled.', 'error');
                    });
            }

            window.addEventListener('offline', () => {
                document.getElementById('offline-banner').classList.remove('hidden');
                showToast('Switched to Offline Mode', 'error');
            });
            window.addEventListener('online', () => {
                document.getElementById('offline-banner').classList.add('hidden');
                showToast('Back Online! Refreshing data...', 'success');
                fetchTubeStatuses();
            });
        }

        // Timer for Auto Refresh Countdown
        function startRefreshTimer() {
            clearInterval(countdownTimer);
            refreshCountdownVal = 60;
            countdownTimer = setInterval(() => {
                refreshCountdownVal--;
                const el = document.getElementById('refresh-countdown');
                if (el) el.innerText = refreshCountdownVal;

                if (refreshCountdownVal <= 0) {
                    fetchTubeStatuses(true);
                    refreshCountdownVal = 60;
                }
            }, 1000);
        }

        // Fetch TfL Statuses with Offline Fallback
        async function fetchTubeStatuses(silent = false) {
            const refreshIcon = document.getElementById('refresh-icon');
            if (!silent && refreshIcon) refreshIcon.classList.add('fa-spin');

            try {
                const response = await fetch('https://api.tfl.gov.uk/Line/Mode/tube/Status');
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const lines = await response.json();
                if (!Array.isArray(lines)) throw new Error('TfL returned an invalid line status response.');
                tubeDataRaw = lines.filter(line => line && typeof line.id === 'string' && TFL_LINES[line.id]);
                if (!tubeDataRaw.length) throw new Error('TfL returned no recognizable Tube lines.');

                const servedFromCache = response.headers.get('X-Tfl-Offline') === 'true';
                const cachedAt = Number(response.headers.get('X-Tfl-Cached-At'));
                const cacheTimestamp = Number.isFinite(cachedAt) && cachedAt > 0 ? cachedAt : Date.now();
                if (!servedFromCache) {
                    saveStoredValue('tfl_status_cache', {
                        timestamp: cacheTimestamp,
                        data: tubeDataRaw
                    });
                } else {
                    document.getElementById('offline-banner').classList.remove('hidden');
                }

                updateLastUpdatedLabel(new Date(cacheTimestamp), servedFromCache);
                renderTubeCards();
                renderPinnedWidget();
                checkCommuteAlerts();
            } catch (error) {
                console.warn('Unable to refresh TfL line status:', error);
                const parsed = readStoredJson('tfl_status_cache', null);
                if (parsed && Array.isArray(parsed.data) && Number.isFinite(parsed.timestamp)) {
                    tubeDataRaw = parsed.data;
                    updateLastUpdatedLabel(new Date(parsed.timestamp), true);
                    renderTubeCards();
                    renderPinnedWidget();
                    document.getElementById('offline-banner').classList.remove('hidden');
                } else {
                    showToast('Unable to fetch tube statuses; no cached status is available.', 'error');
                    document.getElementById('disruption-badge-count').innerText = 'Status unavailable';
                    document.getElementById('cards-container').innerHTML = `
                        <div class="glass-card rounded-2xl p-6 border border-slate-200/80 dark:border-slate-800/80 text-sm text-slate-600 dark:text-slate-300" role="alert">
                            Tube status could not be loaded. Check your connection and try again.
                            <button type="button" onclick="fetchTubeStatuses(false)" class="ml-2 text-blue-600 dark:text-blue-400 font-semibold underline">Retry</button>
                        </div>
                    `;
                }
            } finally {
                if (refreshIcon) refreshIcon.classList.remove('fa-spin');
            }
        }

        function updateLastUpdatedLabel(date, isCached = false) {
            const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const label = document.getElementById('last-updated-text');
            label.innerText = `${isCached ? 'Cached' : 'Updated'} ${isCached ? date.toLocaleDateString() + ' ' : ''}${timeStr}`;
            label.title = date.toLocaleString();
        }

        // Feature 1: STATION-LEVEL REAL-TIME ARRIVALS (Live Countdown Clocks)
        async function fetchStationArrivals(lineId, naptanId, containerId) {
            const container = document.getElementById(containerId);
            if (!container) return;

            container.innerHTML = `<div class="p-3 text-center text-xs text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Fetching live train countdowns...</div>`;

            try {
                const res = await fetch(`https://api.tfl.gov.uk/StopPoint/${naptanId}/Arrivals`);
                if (!res.ok) throw new Error('Arrivals API unavailable');
                
                const arrivals = await res.json();
                
                // Filter for this line and sort by time to station (seconds)
                const lineArrivals = arrivals
                    .filter(a => a.lineId === lineId)
                    .sort((a, b) => a.timeToStation - b.timeToStation)
                    .slice(0, 5); // Take top 5 upcoming

                if (!lineArrivals.length) {
                    container.innerHTML = `<div class="p-3 text-center text-xs text-slate-400">No upcoming trains scheduled at this time.</div>`;
                    return;
                }

                container.innerHTML = `
                    <div class="space-y-1.5 animate-fadeIn">
                        <div class="flex items-center justify-between text-[11px] font-semibold text-slate-400 border-b border-slate-200 dark:border-slate-800 pb-1">
                            <span>Destination & Platform</span>
                            <span>Arrival</span>
                        </div>
                        ${lineArrivals.map(arr => {
                            const mins = Math.floor(arr.timeToStation / 60);
                            const timeDisplay = mins <= 0 ? '<span class="text-emerald-500 font-bold animate-pulse">Due Now</span>' : `<span class="font-bold text-slate-900 dark:text-white">${mins} mins</span>`;
                            const platform = arr.platformName ? arr.platformName.replace('Underground - Platform ', 'P') : 'Platform';

                            return `
                                <div class="flex items-center justify-between text-xs py-1 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 rounded-lg px-2 transition-colors">
                                    <div class="truncate max-w-[70%]">
                                        <div class="font-medium text-slate-800 dark:text-slate-200 truncate">${escapeHtml(arr.destinationName || 'In Service')}</div>
                                        <div class="text-[10px] text-slate-400">${escapeHtml(platform)}</div>
                                    </div>
                                    <div class="text-right">${timeDisplay}</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            } catch (err) {
                console.error('Arrivals error:', err);
                container.innerHTML = `<div class="p-3 text-center text-xs text-red-400">Live arrivals are temporarily unavailable.</div>`;
            }
        }

        // Toggle Live Arrivals Drawer
        function toggleArrivals(lineId, naptanId) {
            const key = `${lineId}_${naptanId}`;
            if (expandedArrivals.has(key)) {
                expandedArrivals.delete(key);
            } else {
                expandedArrivals.add(key);
            }
            renderTubeCards();
            if (expandedArrivals.has(key)) {
                fetchStationArrivals(lineId, naptanId, `arrivals-${key}`);
            }
        }

        // Feature 2: LINE PINNING & FAVORITES
        function togglePinLine(lineId) {
            if (pinnedLines.has(lineId)) {
                pinnedLines.delete(lineId);
                showToast(`Removed from pinned lines`, 'info');
            } else {
                pinnedLines.add(lineId);
                showToast(`Pinned line to daily commute`, 'success');
            }
            saveStoredValue('tfl_pinned_lines', [...pinnedLines]);
            renderTubeCards();
            renderPinnedWidget();
        }

        // Render Pinned Quick Glance Widget Bar
        function renderPinnedWidget() {
            const widget = document.getElementById('pinned-widget');
            const container = document.getElementById('pinned-chips-container');

            if (!pinnedLines.size || !tubeDataRaw.length) {
                widget.classList.add('hidden');
                return;
            }

            widget.classList.remove('hidden');

            const pinnedItems = tubeDataRaw.filter(l => pinnedLines.has(l.id));
            container.innerHTML = pinnedItems.map(line => {
                const meta = TFL_LINES[line.id] || { color: '#000000' };
                const statusObj = line.lineStatuses && line.lineStatuses[0] ? line.lineStatuses[0] : {};
                const isGood = (statusObj.statusSeverity === 10);
                const statusName = statusObj.statusSeverityDescription || 'Good Service';
                const safeName = escapeHtml(line.name);

                return `
                    <button type="button" onclick="scrollToLineCard('${line.id}')" class="cursor-pointer inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all shadow-2xs">
                        <span class="w-3 h-3 rounded-full flex-shrink-0" style="background-color: ${meta.color};"></span>
                        <span class="text-xs font-bold text-slate-800 dark:text-slate-100">${safeName}</span>
                        <span class="text-[10px] font-semibold px-2 py-0.5 rounded-md ${isGood ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300'}">
                            ${escapeHtml(statusName)}
                        </span>
                    </button>
                `;
            }).join('');
        }

        function scrollToLineCard(lineId) {
            const el = document.getElementById(`card-${lineId}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('ring-2', 'ring-blue-500');
                setTimeout(() => el.classList.remove('ring-2', 'ring-blue-500'), 2000);
            }
        }

        // Distance & Proximity Calculations
        function calculateLineProximity(lineId) {
            const nodes = nearbyLineStations[lineId] || LINE_STATION_NODES[lineId] || [];
            if (!nodes.length) return { distanceKm: 999, nearestNode: { name: 'Unknown', naptan: '' } };

            let minDist = Infinity;
            let nearest = nodes[0];

            nodes.forEach(node => {
                const dist = haversineDistance(userLocation.lat, userLocation.lon, node.lat, node.lon);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = node;
                }
            });

            return {
                distanceKm: minDist,
                nearestNode: nearest
            };
        }

        let nearbyStationsRequest = 0;

        async function loadNearbyStations() {
            const requestId = ++nearbyStationsRequest;
            const query = new URLSearchParams({
                lat: String(userLocation.lat),
                lon: String(userLocation.lon),
                stopTypes: 'NaptanMetroStation',
                radius: '2000'
            });

            try {
                const response = await fetch(`https://api.tfl.gov.uk/StopPoint?${query}`);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const result = await response.json();
                const stations = Array.isArray(result) ? result : result.stopPoints;
                if (!Array.isArray(stations)) throw new Error('TfL returned invalid nearby station data.');

                const byLine = {};
                stations.forEach(station => {
                    const lineIds = new Set([
                        ...(Array.isArray(station.lineIds) ? station.lineIds : []),
                        ...(Array.isArray(station.lines) ? station.lines : []).map(line => typeof line === 'string' ? line : line.id),
                        ...(Array.isArray(station.lineModeGroups) ? station.lineModeGroups : [])
                            .flatMap(group => Array.isArray(group.lineIds) ? group.lineIds : [])
                    ]);
                    const stationLat = Number(station.lat);
                    const stationLon = Number(station.lon);
                    const stationId = station.id || station.naptanId;
                    if (typeof stationId !== 'string' || !/^[A-Za-z0-9]+$/.test(stationId)
                        || !station.commonName || !Number.isFinite(stationLat) || !Number.isFinite(stationLon)) return;

                    lineIds.forEach(lineId => {
                        if (!TFL_LINES[lineId]) return;
                        if (!byLine[lineId]) byLine[lineId] = [];
                        byLine[lineId].push({
                            name: station.commonName,
                            naptan: stationId,
                            lat: stationLat,
                            lon: stationLon
                        });
                    });
                });

                if (requestId !== nearbyStationsRequest) return;
                if (Object.keys(byLine).length) {
                    nearbyLineStations = byLine;
                } else {
                    throw new Error('TfL returned no usable nearby Underground stations.');
                }
                renderTubeCards();
            } catch (error) {
                if (requestId !== nearbyStationsRequest) return;
                console.warn('Using fallback station list because nearby TfL station lookup failed:', error);
                nearbyLineStations = LINE_STATION_NODES;
                if (navigator.onLine) showToast('Nearby station data unavailable; using a limited station list.', 'error');
                renderTubeCards();
            }
        }

        // Feature 5: ALTERNATIVE ROUTE & ADJACENT LINE SUGGESTIONS
        function generateAlternativeAdvice(disruptedLine) {
            // Find non-disrupted lines
            const operationalLines = tubeDataRaw.filter(l => {
                if (l.id === disruptedLine.id) return false;
                const status = l.lineStatuses && l.lineStatuses[0] ? l.lineStatuses[0].statusSeverity : 10;
                return status === 10;
            });

            if (!operationalLines.length) return null;

            // Sort operational lines by distance to user
            const alternative = operationalLines.map(l => ({
                line: l,
                prox: calculateLineProximity(l.id)
            })).sort((a, b) => a.prox.distanceKm - b.prox.distanceKm)[0];

            if (!alternative) return null;

            const altMeta = TFL_LINES[alternative.line.id];
            return {
                altLineName: alternative.line.name,
                altStation: alternative.prox.nearestNode.name,
                color: altMeta ? altMeta.color : '#3b82f6',
                distanceKm: alternative.prox.distanceKm
            };
        }

        // Render Cards Grid
        function renderTubeCards() {
            const container = document.getElementById('cards-container');
            if (!tubeDataRaw || !tubeDataRaw.length) return;

            const sortBy = document.getElementById('sort-select').value;

            // Process lines
            let lines = tubeDataRaw.map(line => {
                const proximity = calculateLineProximity(line.id);
                const statusObj = line.lineStatuses && line.lineStatuses[0] ? line.lineStatuses[0] : {};
                const statusSeverity = statusObj.statusSeverity !== undefined ? statusObj.statusSeverity : 10;
                const statusDescription = statusObj.statusSeverityDescription || 'Good Service';
                const reason = statusObj.reason || null;
                const isPinned = pinnedLines.has(line.id);

                return {
                    id: line.id,
                    name: line.name,
                    statusDescription: statusDescription,
                    statusSeverity: statusSeverity,
                    reason: reason,
                    distanceKm: proximity.distanceKm,
                    nearestNode: proximity.nearestNode,
                    isPinned: isPinned,
                    meta: TFL_LINES[line.id] || { color: '#000000', textColor: '#FFFFFF' }
                };
            });
            const filterText = document.getElementById('line-filter').value.trim().toLocaleLowerCase();
            if (filterText) {
                lines = lines.filter(line =>
                    line.name.toLocaleLowerCase().includes(filterText)
                    || line.statusDescription.toLocaleLowerCase().includes(filterText)
                    || (line.reason || '').toLocaleLowerCase().includes(filterText)
                );
            }

            // Disruption counter always reflects all lines, regardless of the active filter.
            const disruptedCount = tubeDataRaw.filter(line => {
                const severity = line.lineStatuses && line.lineStatuses[0]
                    ? line.lineStatuses[0].statusSeverity
                    : 10;
                return severity !== undefined && severity !== 10;
            }).length;
            const countBadge = document.getElementById('disruption-badge-count');
            if (disruptedCount === 0) {
                countBadge.className = "px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-semibold border border-emerald-200 dark:border-emerald-800";
                countBadge.innerHTML = `<i class="fa-solid fa-circle-check mr-1 text-xs"></i> Good Service on All Lines`;
            } else {
                countBadge.className = "px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 font-semibold border border-amber-200 dark:border-amber-800";
                countBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-1 text-xs"></i> ${disruptedCount} ${disruptedCount === 1 ? 'Line Disrupted' : 'Lines Disrupted'}`;
            }

            lines = sortLines(lines, sortBy);

            // Render Output
            if (!lines.length) {
                container.innerHTML = '<div class="glass-card rounded-2xl p-6 border border-slate-200/80 dark:border-slate-800/80 text-sm text-slate-500 dark:text-slate-400" role="status">No Tube lines match your filter.</div>';
                return;
            }

            container.innerHTML = lines.map(line => {
                const isGoodService = line.statusSeverity === 10;
                const formattedDist = distanceUnit === 'miles' 
                    ? `${(line.distanceKm * 0.621371).toFixed(1)} mi` 
                    : `${line.distanceKm.toFixed(1)} km`;

                const arrivalsKey = `${line.id}_${line.nearestNode.naptan}`;
                const isArrivalsExpanded = expandedArrivals.has(arrivalsKey);
                const isDisruptionExpanded = expandedDisruptions.has(line.id);

                let statusBadgeStyle = "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800";
                let pulseClass = "";
                
                if (!isGoodService) {
                    if (line.statusSeverity < 6) {
                        statusBadgeStyle = "bg-red-100 text-red-800 dark:bg-red-950/90 dark:text-red-300 border-red-300 dark:border-red-800";
                        pulseClass = "pulse-glow-red";
                    } else {
                        statusBadgeStyle = "bg-amber-100 text-amber-800 dark:bg-amber-950/90 dark:text-amber-300 border-amber-300 dark:border-amber-800";
                        pulseClass = "pulse-glow-amber";
                    }
                }

                // Alternative Route Advice Generator
                const altAdvice = !isGoodService ? generateAlternativeAdvice(line) : null;
                const safeName = escapeHtml(line.name);
                const safeStationName = escapeHtml(line.nearestNode.name);
                const alternativeDistance = altAdvice
                    ? (distanceUnit === 'miles' ? `${(altAdvice.distanceKm * 0.621371).toFixed(1)} mi` : `${altAdvice.distanceKm.toFixed(1)} km`)
                    : '';

                return `
                    <div id="card-${line.id}" class="glass-card rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-2xs hover:shadow-md transition-all overflow-hidden flex flex-col">
                        <!-- Card Banner Top -->
                        <div class="h-2.5 w-full flex items-center justify-end px-3" style="background-color: ${line.meta.color};"></div>
                        
                        <div class="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-4">
                            <div>
                                <!-- Top Row: Line Name, Pin & Proximity -->
                                <div class="flex items-start justify-between gap-2">
                                    <div class="flex items-center space-x-2.5">
                                        <button aria-label="${line.isPinned ? 'Unpin' : 'Pin'} ${safeName} for daily commute" aria-pressed="${line.isPinned}" onclick="togglePinLine('${line.id}')" title="Star Line for Daily Commute" class="text-base focus:outline-none transition-transform active:scale-125">
                                            <i class="fa-${line.isPinned ? 'solid text-amber-400' : 'regular text-slate-300 dark:text-slate-600 hover:text-amber-400'} fa-star"></i>
                                        </button>
                                        <div class="w-3.5 h-3.5 rounded-full flex-shrink-0 shadow-2xs" style="background-color: ${line.meta.color};"></div>
                                        <h3 class="font-bold text-base text-slate-900 dark:text-white leading-tight">${safeName}</h3>
                                    </div>

                                    <div class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 text-xs font-semibold" title="Straight-line distance to nearest TfL station">
                                        <i class="fa-solid fa-route text-slate-400 text-[10px]"></i>
                                        <span>${formattedDist}</span>
                                    </div>
                                </div>

                                <!-- Station & Status Badge -->
                                <div class="flex flex-wrap items-center justify-between gap-2 mt-3">
                                    <div class="text-xs text-slate-500 dark:text-slate-400 flex items-center space-x-1">
                                        <i class="fa-solid fa-train-subway text-slate-400"></i>
                                        <span>Nearest: <strong class="text-slate-700 dark:text-slate-300 font-medium">${safeStationName}</strong></span>
                                    </div>

                                    <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${statusBadgeStyle} ${pulseClass}">
                                        ${isGoodService ? '<i class="fa-solid fa-circle-check mr-1.5 text-[10px]"></i>' : '<i class="fa-solid fa-circle-exclamation mr-1.5 text-[10px]"></i>'}
                                        ${escapeHtml(line.statusDescription)}
                                    </span>
                                </div>
                            </div>

                            <!-- Feature 1: Live Arrivals Toggle Button -->
                            <div class="pt-2 border-t border-slate-100 dark:border-slate-800/80">
                                <button aria-expanded="${isArrivalsExpanded}" aria-controls="arrivals-${arrivalsKey}" aria-label="Live arrivals at ${safeStationName} for ${safeName}" onclick="toggleArrivals('${line.id}', '${line.nearestNode.naptan}')" 
                                        class="w-full flex items-center justify-between text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 py-1 focus:outline-none">
                                    <span class="flex items-center space-x-1.5">
                                        <i class="fa-solid fa-clock text-blue-500"></i>
                                        <span>Live Arrivals at ${safeStationName}</span>
                                    </span>
                                    <i class="fa-solid ${isArrivalsExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} text-xs"></i>
                                </button>

                                <div id="arrivals-${arrivalsKey}" class="${isArrivalsExpanded ? 'mt-2.5 p-3 rounded-xl bg-slate-100/70 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800' : 'hidden'}">
                                    <!-- Arrivals loaded asynchronously -->
                                </div>
                            </div>

                            <!-- Disruption Details & Alternative Route Advice (If Disrupted) -->
                            ${line.reason ? `
                                <div class="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
                                    <button aria-expanded="${isDisruptionExpanded}" aria-controls="disruption-${line.id}" onclick="toggleDisruption('${line.id}')" 
                                            class="w-full flex items-center justify-between text-xs text-amber-600 dark:text-amber-400 font-medium focus:outline-none">
                                        <span class="flex items-center space-x-1">
                                            <i class="fa-solid fa-triangle-exclamation"></i>
                                            <span>Disruption Reason & Advice</span>
                                        </span>
                                        <i class="fa-solid ${isDisruptionExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} text-xs"></i>
                                    </button>

                                    <div id="disruption-${line.id}" class="${isDisruptionExpanded ? 'p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-slate-700 dark:text-slate-300 space-y-2 animate-fadeIn' : 'hidden'}">
                                            <p class="leading-relaxed">${escapeHtml(line.reason)}</p>

                                            <!-- Feature 5: Smart Alternative Suggestion -->
                                            ${altAdvice ? `
                                                <div class="mt-2 pt-2 border-t border-amber-500/20 text-[11px] font-medium text-slate-800 dark:text-slate-200 flex items-start space-x-2">
                                                    <i class="fa-solid fa-person-walking text-blue-500 mt-0.5"></i>
                                                    <div>
                                                        <span class="font-bold">Nearby alternative:</span> ${escapeHtml(altAdvice.altStation)} is approximately ${alternativeDistance} away in a straight line; consider the <strong>${escapeHtml(altAdvice.altLineName)} Line</strong> (Good Service). Walking directions are not calculated.
                                                    </div>
                                                </div>
                                    ` : ''}
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
            }).join('');

            // Automatically trigger load for open arrivals drawers
            expandedArrivals.forEach(key => {
                const [lineId, naptanId] = key.split('_');
                fetchStationArrivals(lineId, naptanId, `arrivals-${key}`);
            });
        }

        function toggleDisruption(lineId) {
            if (expandedDisruptions.has(lineId)) {
                expandedDisruptions.delete(lineId);
            } else {
                expandedDisruptions.add(lineId);
            }
            renderTubeCards();
        }

        // Location & Search Handlers
        function useCurrentLocation() {
            if (!navigator.geolocation) {
                showToast('Geolocation is not supported by your browser.', 'error');
                return;
            }

            const gpsBtn = document.getElementById('gps-btn');
            gpsBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Locating...</span>`;

            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    userLocation = {
                        lat: pos.coords.latitude,
                        lon: pos.coords.longitude,
                        name: 'Your GPS Location'
                    };
                    document.getElementById('hub-select').selectedIndex = 0;
                    gpsBtn.innerHTML = `<i class="fa-solid fa-location-crosshairs"></i> <span>Use My Location</span>`;
                    updateOrigin();
                    showToast('Location updated via GPS', 'success');
                },
                () => {
                    gpsBtn.innerHTML = `<i class="fa-solid fa-location-crosshairs"></i> <span>Use My Location</span>`;
                    showToast('Unable to retrieve location.', 'error');
                },
                { enableHighAccuracy: true, timeout: 8000 }
            );
        }

        function handleHubSelect(val) {
            if (!val) return;
            const [lat, lon, naptan, name] = val.split(',');
            userLocation = {
                lat: parseFloat(lat),
                lon: parseFloat(lon),
                name: name
            };

            document.getElementById('search-input').value = '';
            updateOrigin();
            showToast(`Origin set to ${name}`, 'info');
        }

        function updateOrigin() {
            document.getElementById('current-location-label').innerText = userLocation.name;
            updateJourneyOriginLabel();
            savePreferences();
            loadNearbyStations();
            renderTubeCards();
            if (destinationLocation) planJourney();
        }

        async function handleLocationSearch(e) {
            e.preventDefault();
            const query = document.getElementById('search-input').value.trim();
            if (!query) return;

            showToast(`Searching for "${query}"...`, 'info');

            try {
                const place = await geocodeLondonLocation(query);
                if (!place) {
                    showToast(`Location "${query}" not found.`, 'error');
                    return;
                }
                userLocation = place;
                document.getElementById('hub-select').selectedIndex = 0;
                document.getElementById('search-input').value = '';
                updateOrigin();
                showToast(`Origin set to ${place.name}`, 'success');
            } catch (error) {
                console.warn('Unable to search for location:', error);
                showToast('Geocoding service unavailable.', 'error');
            }
        }

        async function geocodeLondonLocation(query) {
            const params = new URLSearchParams({
                format: 'jsonv2',
                q: `${query}, London, UK`,
                limit: '1'
            });
            const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
            if (!response.ok) throw new Error(`Geocoding service returned HTTP ${response.status}`);
            const results = await response.json();
            if (!Array.isArray(results) || !results.length) return null;

            const place = results[0];
            const lat = Number(place.lat);
            const lon = Number(place.lon);
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                throw new Error('Geocoding service returned invalid coordinates.');
            }
            return {
                lat,
                lon,
                name: String(place.display_name || query).split(',')[0]
            };
        }

        function updateJourneyOriginLabel() {
            document.getElementById('journey-origin-label').textContent = userLocation.name;
            document.getElementById('journey-origin-label-mobile').textContent = userLocation.name;
            document.getElementById('journey-origin-label').title = userLocation.name;
            document.getElementById('journey-origin-label-mobile').title = userLocation.name;
        }

        async function handleJourneySearch(event) {
            event.preventDefault();
            const query = document.getElementById('destination-input').value.trim();
            if (!query) return;

            const button = document.getElementById('journey-submit-btn');
            button.disabled = true;
            button.querySelector('span').textContent = 'Finding destination...';
            try {
                const place = await geocodeLondonLocation(query);
                if (!place) {
                    renderJourneyMessage(`Destination "${query}" was not found. Try a Tube station, London postcode or nearby place.`, true);
                    return;
                }
                destinationLocation = place;
                document.getElementById('destination-input').value = place.name;
                savePreferences();
                await planJourney();
            } catch (error) {
                console.error('Unable to find journey destination:', error);
                renderJourneyMessage('Could not search for that destination. Check your connection and try again.', true);
            } finally {
                button.disabled = false;
                button.querySelector('span').textContent = 'Find routes';
            }
        }

        function handleJourneyPreferenceChange() {
            if (destinationLocation) planJourney();
        }

        async function planJourney() {
            if (!destinationLocation) return;
            const requestId = ++journeyRequestId;
            const button = document.getElementById('journey-submit-btn');
            const results = document.getElementById('journey-results');
            const preference = document.getElementById('journey-preference').value;
            const preferenceLabels = {
                LeastTime: 'Fastest',
                LeastInterchange: 'Fewest changes',
                LeastWalking: 'Less walking'
            };
            button.disabled = true;
            button.querySelector('span').textContent = 'Finding routes...';
            renderJourneyMessage(`Finding Tube routes from ${userLocation.name} to ${destinationLocation.name}...`);

            try {
                const from = `${userLocation.lat.toFixed(6)},${userLocation.lon.toFixed(6)}`;
                const to = `${destinationLocation.lat.toFixed(6)},${destinationLocation.lon.toFixed(6)}`;
                const params = new URLSearchParams({
                    mode: 'tube',
                    journeyPreference: preference,
                    includeAlternativeRoutes: 'true',
                    useRealTimeLiveArrivals: 'true',
                    applyHtmlMarkup: 'false',
                    fromName: userLocation.name,
                    toName: destinationLocation.name
                });
                const url = `https://api.tfl.gov.uk/Journey/JourneyResults/${encodeURIComponent(from)}/to/${encodeURIComponent(to)}?${params}`;
                const response = await fetch(url);
                if (!response.ok) throw new Error(`TfL Journey Planner returned HTTP ${response.status}`);
                const data = await response.json();
                if (requestId !== journeyRequestId) return;

                const routes = normalizeJourneyOptions(data.journeys);
                if (!routes.length) {
                    renderJourneyMessage(data.journeyPlannerError?.message
                        || 'TfL did not return a Tube route for these locations. Try a nearby station or change your origin.', true);
                    return;
                }

                if (preference === 'LeastInterchange') {
                    routes.sort((a, b) => a.changes - b.changes || a.duration - b.duration);
                } else if (preference === 'LeastWalking') {
                    routes.sort((a, b) => a.walkingMinutes - b.walkingMinutes || a.duration - b.duration);
                } else {
                    routes.sort((a, b) => a.duration - b.duration);
                }
                renderJourneyOptions(routes.slice(0, 3), preferenceLabels[preference] || 'Recommended');
            } catch (error) {
                if (requestId !== journeyRequestId) return;
                console.error('Unable to plan Tube journey:', error);
                renderJourneyMessage('Could not load journey options from TfL. Check your connection and try again.', true);
            } finally {
                if (requestId === journeyRequestId) {
                    button.disabled = false;
                    button.querySelector('span').textContent = 'Find routes';
                }
            }
        }

        function renderJourneyMessage(message, isError = false) {
            const results = document.getElementById('journey-results');
            results.classList.remove('hidden');
            results.innerHTML = `<p ${isError ? 'role="alert"' : ''} class="text-sm ${isError ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}">${escapeHtml(message)}</p>`;
        }

        function renderJourneyOptions(routes, preferenceLabel) {
            const results = document.getElementById('journey-results');
            const routeCards = routes.map((route, index) => {
                const lineChips = route.lines.map(lineName => {
                    const lineId = Object.keys(TFL_LINES).find(id => TFL_LINES[id].name === lineName);
                    const line = lineId ? TFL_LINES[lineId] : null;
                    return `<span class="inline-flex items-center rounded-md px-2 py-1 text-xs font-bold" style="background-color:${line ? line.color : '#e2e8f0'};color:${line ? line.textColor : '#1e293b'}">${escapeHtml(lineName)} line</span>`;
                }).join('');
                const legs = route.legs.map(leg => {
                    const modeLabel = leg.mode === 'tube' ? (leg.lineName ? `${leg.lineName} line` : 'Tube') : leg.mode;
                    const instruction = leg.instruction || `${modeLabel}: ${leg.departure} to ${leg.arrival}`;
                    const endpoints = leg.departure && leg.arrival
                        ? `<p class="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">${escapeHtml(leg.departure)} <i class="fa-solid fa-arrow-right mx-1 text-[9px]"></i> ${escapeHtml(leg.arrival)}</p>`
                        : '';
                    return `
                        <li class="journey-leg flex items-start justify-between gap-3 text-xs">
                            <div class="min-w-0">
                                <p class="font-medium text-slate-800 dark:text-slate-200">${escapeHtml(instruction)}</p>
                                ${endpoints}
                            </div>
                            <span class="shrink-0 text-slate-500 dark:text-slate-400">${leg.duration} min</span>
                        </li>`;
                }).join('');
                const disruptions = route.disruptions.map(description =>
                    `<li class="flex items-start gap-2"><i class="fa-solid fa-triangle-exclamation mt-0.5"></i><span>${escapeHtml(description)}</span></li>`
                ).join('');
                const changeLabel = route.changes === 1 ? '1 change' : `${route.changes} changes`;
                const walkingLabel = `${route.walkingMinutes} min walking`;

                return `
                    <article class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-3 sm:p-4">
                        <div class="flex flex-wrap items-start justify-between gap-2">
                            <div>
                                <h3 class="text-sm font-bold text-slate-900 dark:text-white">Option ${index + 1}</h3>
                                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">${index === 0 ? `${escapeHtml(preferenceLabel)} · ` : ''}${route.duration} min total · ${escapeHtml(changeLabel)} · ${escapeHtml(walkingLabel)}</p>
                            </div>
                            ${route.arrivalDateTime ? `<time class="text-xs font-semibold text-slate-600 dark:text-slate-300" datetime="${escapeHtml(route.arrivalDateTime)}">Arrives ${escapeHtml(new Date(route.arrivalDateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</time>` : ''}
                        </div>
                        ${lineChips ? `<div class="mt-2 flex flex-wrap gap-1.5">${lineChips}</div>` : ''}
                        <ol class="mt-3 space-y-2">${legs}</ol>
                        ${disruptions ? `<ul class="mt-3 space-y-1.5 rounded-lg bg-amber-100/80 p-2.5 text-xs text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">${disruptions}</ul>` : ''}
                    </article>`;
            }).join('');
            results.classList.remove('hidden');
            results.innerHTML = `
                <div class="space-y-3">
                    <div>
                        <h3 class="text-sm font-bold text-slate-900 dark:text-white">Routes: ${escapeHtml(userLocation.name)} to ${escapeHtml(destinationLocation.name)}</h3>
                        <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">Tube and walking options from TfL Journey Planner. Times and disruption details may change.</p>
                    </div>
                    <div class="grid gap-2.5">${routeCards}</div>
                </div>`;
        }

        // Feature 4: SMART COMMUTE REMINDERS & NOTIFICATIONS
        function openAlertModal() {
            const modal = document.getElementById('alert-modal');
            modal.classList.remove('hidden');
            document.getElementById('notif-perm-btn').focus();
        }

        function handleAlertModalKeydown(event) {
            const modal = document.getElementById('alert-modal');
            if (event.key === 'Escape') {
                event.preventDefault();
                closeAlertModal();
                return;
            }
            if (event.key !== 'Tab') return;

            const focusable = [...modal.querySelectorAll('button, input')]
                .filter(element => !element.disabled);
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (!modal.contains(document.activeElement)) {
                event.preventDefault();
                first.focus();
                return;
            }
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }

        function closeAlertModal() {
            document.getElementById('alert-modal').classList.add('hidden');
            document.getElementById('alert-open-btn').focus();
        }

        async function requestNotificationPermission() {
            if (!('Notification' in window)) {
                showToast('Notifications not supported in this browser.', 'error');
                return;
            }

            try {
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    showToast('Notifications enabled!', 'success');
                    document.getElementById('notif-perm-btn').innerText = 'Enabled';
                    document.getElementById('notif-perm-btn').className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white';
                } else {
                    showToast('Notification permission denied.', 'error');
                }
            } catch (error) {
                console.error('Unable to request notification permission:', error);
                showToast('Unable to request notification permission.', 'error');
            }
        }

        function saveAlertSettings() {
            const morning = document.getElementById('commute-morning-start').value;
            const evening = document.getElementById('commute-evening-start').value;

            saveStoredValue('tfl_alert_settings', { morning, evening });
            document.getElementById('alert-dot').classList.remove('hidden');
            closeAlertModal();
            showToast('Commute alert window saved!', 'success');
        }

        function loadAlertSettings() {
            const settings = readStoredJson('tfl_alert_settings', null);
            if (!settings) return;
            document.getElementById('commute-morning-start').value = settings.morning || '';
            document.getElementById('commute-evening-start').value = settings.evening || '';
            document.getElementById('alert-dot').classList.remove('hidden');
        }

        function checkCommuteAlerts() {
            if (!('Notification' in window) || Notification.permission !== 'granted') return;

            const settings = readStoredJson('tfl_alert_settings', null);
            if (!settings || !pinnedLines.size || !tubeDataRaw.length) return;

            const now = new Date();
            if (!isWithinCommuteWindow(now, [settings.morning, settings.evening])) return;

            tubeDataRaw.forEach(line => {
                if (pinnedLines.has(line.id)) {
                    const status = line.lineStatuses && line.lineStatuses[0] ? line.lineStatuses[0].statusSeverity : 10;
                    if (status !== 10) {
                        const lastNotified = Number(readStoredJson(`notified_${line.id}`, 0)) || 0;
                        const tenMins = 10 * 60 * 1000;

                        if (!lastNotified || now.getTime() - lastNotified > tenMins) {
                            new Notification(`TfL Commute Alert: ${line.name} Line`, {
                                body: `${line.lineStatuses[0].statusSeverityDescription}: ${line.lineStatuses[0].reason || 'Delays reported.'}`,
                                icon: './icon.svg'
                            });
                            saveStoredValue(`notified_${line.id}`, now.getTime());
                        }
                    } else {
                        removeStoredValue(`notified_${line.id}`);
                    }
                }
            });
        }

        function setDistanceUnit(unit, persist = true) {
            distanceUnit = unit;
            const btnKm = document.getElementById('unit-km');
            const btnMiles = document.getElementById('unit-miles');

            if (unit === 'km') {
                btnKm.className = "px-2.5 py-1 rounded-md text-xs font-semibold transition-all bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs";
                btnMiles.className = "px-2.5 py-1 rounded-md text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all";
            } else {
                btnMiles.className = "px-2.5 py-1 rounded-md text-xs font-semibold transition-all bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs";
                btnKm.className = "px-2.5 py-1 rounded-md text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all";
            }

            btnKm.setAttribute('aria-pressed', String(unit === 'km'));
            btnMiles.setAttribute('aria-pressed', String(unit === 'miles'));
            if (persist) savePreferences();
            renderTubeCards();
        }

        function initTheme() {
            const isDark = !(storedPreferences.theme === 'light' || readStoredValue('theme') === 'light');
            if (!isDark) {
                document.documentElement.classList.remove('dark');
                document.getElementById('theme-icon').className = 'fa-solid fa-moon text-sm';
            } else {
                document.documentElement.classList.add('dark');
                document.getElementById('theme-icon').className = 'fa-solid fa-sun text-sm text-amber-400';
            }
            document.getElementById('theme-toggle').setAttribute('aria-pressed', String(isDark));
        }

        function toggleTheme() {
            const isDark = document.documentElement.classList.toggle('dark');
            const icon = document.getElementById('theme-icon');
            if (isDark) {
                icon.className = 'fa-solid fa-sun text-sm text-amber-400';
            } else {
                icon.className = 'fa-solid fa-moon text-sm';
            }
            document.getElementById('theme-toggle').setAttribute('aria-pressed', String(isDark));
            savePreferences();
        }

        function showToast(message, type = 'info') {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            const iconElement = document.createElement('i');
            const messageElement = document.createElement('span');
            
            let bgStyle = 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900';
            let icon = 'fa-info-circle text-blue-400';

            if (type === 'error') {
                bgStyle = 'bg-red-600 text-white';
                icon = 'fa-circle-exclamation';
            } else if (type === 'success') {
                bgStyle = 'bg-emerald-600 text-white';
                icon = 'fa-circle-check';
            }

            toast.className = `pointer-events-auto px-4 py-2.5 rounded-xl shadow-lg text-xs font-medium flex items-center space-x-2 transition-all duration-300 transform translate-y-2 opacity-0 ${bgStyle}`;
            iconElement.className = `fa-solid ${icon}`;
            messageElement.textContent = message;
            toast.append(iconElement, messageElement);

            container.appendChild(toast);

            requestAnimationFrame(() => {
                toast.classList.remove('translate-y-2', 'opacity-0');
            });

            setTimeout(() => {
                toast.classList.add('opacity-0', 'translate-y-2');
                setTimeout(() => toast.remove(), 300);
            }, 3500);
        }

        Object.assign(window, {
            closeAlertModal,
            fetchTubeStatuses,
            handleHubSelect,
            handleJourneyPreferenceChange,
            handleJourneySearch,
            handleLocationSearch,
            openAlertModal,
            renderTubeCards,
            requestNotificationPermission,
            saveAlertSettings,
            scrollToLineCard,
            setDistanceUnit,
            toggleArrivals,
            toggleDisruption,
            togglePinLine,
            toggleTheme,
            useCurrentLocation
        });