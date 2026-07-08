// Supabase Config (embedded directly for public web app access)
const SUPABASE_URL = "https://voeijjbnjvcchcryynhe.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZvZWlqamJuanZjY2hjcnl5bmhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0NTg0NTAsImV4cCI6MjA5OTAzNDQ1MH0.JyBXojePPs3tziXIRfLv0UMWu5dVWKdptKcJ3pQ3TsY";

// Initialize Supabase Client
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// State Variables
const processedIds = new Set();
let lastId = 0;
const MAX_DATA_POINTS = 20; // 20 logs for default chart display

// Data structures for default charts (max 20 points)
const chartLabels = [];
const tempValues = [];
const humidValues = [];
const coValues = [];
const statusCodes = [];

// Chart Instances
let tempChart, humidChart, coChart;

// DOM Elements
const dbStatusEl = document.getElementById('db-status');
const timeBadgeEl = document.getElementById('time-badge');
const rtLogWindowEl = document.getElementById('rt-log-window');
const evtLogWindowEl = document.getElementById('evt-log-window');
const rtCountEl = document.getElementById('rt-count');
const evtCountEl = document.getElementById('evt-count');
const currentTempEl = document.getElementById('current-temp');
const currentHumidEl = document.getElementById('current-humid');
const currentCoEl = document.getElementById('current-co');

const rtCard = document.getElementById('realtime-log-card');
const evtCard = document.getElementById('event-log-card');
const rtHint = document.getElementById('rt-hint');
const evtHint = document.getElementById('evt-hint');

// Chart Card Elements & Hints
const tempCard = document.getElementById('temp-card');
const humidCard = document.getElementById('humid-card');
const coCard = document.getElementById('co-card');
const tempHint = document.getElementById('temp-hint');
const humidHint = document.getElementById('humid-hint');
const coHint = document.getElementById('co-hint');

// Tracking chart expand/collapse state (default 20 points, expandable to 17280 points)
const chartStates = {
    temp: { expanded: false, loading: false },
    humid: { expanded: false, loading: false },
    co: { expanded: false, loading: false }
};

// Helper to determine status description
function getStatusInfo(statusCode) {
    if (statusCode === 2) return { text: "위험", className: "status-danger" };
    if (statusCode === 1) return { text: "경고", className: "status-warning" };
    return { text: "정상", className: "status-normal" };
}

// Z-score Anomaly Identifier
// Computes deviation using training data statistics (mean & std):
// Temperature_C: mean = 24.47, std = 1.95
// Humidity_Percent: mean = 60.97, std = 2.30
// CO_ppm: mean = 32.24, std = 9.33
function getAnomalousSensor(index, st, chart) {
    if (st === 1) {
        // Warning is strictly temperature anomaly (Temp >= 40.0)
        return 'temp';
    }
    if (st === 2) {
        let temp, humid, co;
        
        if (chart && chart.statusCodes) {
            // Expanded mode (17280 points): extract values from the chart's local lists
            temp = chart.tempList[index];
            humid = chart.humidList[index];
            co = chart.coList[index];
        } else {
            // Default/Collapsed mode (20 points): extract from global live lists
            temp = tempValues[index];
            humid = humidValues[index];
            co = coValues[index];
        }

        if (temp === undefined || humid === undefined || co === undefined) return null;

        // Primary rule override: Temp >= 40.0 is Temperature anomaly
        if (temp >= 40.0) return 'temp';

        // Calculate Z-scores
        const zTemp = Math.abs(temp - 24.4696) / 1.9465;
        const zHumid = Math.abs(humid - 60.9735) / 2.3036;
        const zCo = Math.abs(co - 32.2420) / 9.3260;

        const maxZ = Math.max(zTemp, zHumid, zCo);
        if (maxZ === zTemp) return 'temp';
        if (maxZ === zHumid) return 'humid';
        return 'co';
    }
    return null;
}

// Chart.js background shading plugin
function createVerticalBandPlugin(chartId, checkAnomalyFn) {
    return {
        id: `verticalBand_${chartId}`,
        beforeDraw: (chart) => {
            const { ctx, chartArea, scales } = chart;
            if (!chartArea || !scales.x) return;

            const meta = chart.getDatasetMeta(0);
            if (!meta.data || meta.data.length === 0) return;

            // Use expanded list statusCodes if chart is expanded, otherwise use global statusCodes
            const activeStatusCodes = chart.statusCodes || statusCodes;

            ctx.save();
            for (let i = 0; i < activeStatusCodes.length; i++) {
                const st = activeStatusCodes[i];
                if (st > 0 && checkAnomalyFn(i, st, chart)) {
                    if (meta.data[i]) {
                        const currentX = meta.data[i].x;

                        // Calculate width of band
                        let width = 10;
                        if (meta.data.length > 1) {
                            if (i === 0) {
                                width = meta.data[1].x - currentX;
                            } else if (i === meta.data.length - 1) {
                                width = currentX - meta.data[i-1].x;
                            } else {
                                width = (meta.data[i+1].x - meta.data[i-1].x) / 2;
                            }
                        }

                        // Background shading color
                        ctx.fillStyle = st === 2 ? 'rgba(239, 68, 68, 0.22)' : 'rgba(249, 115, 22, 0.22)';
                        ctx.fillRect(
                            currentX - width / 2,
                            chartArea.top,
                            width,
                            chartArea.bottom - chartArea.top
                        );
                    }
                }
            }
            ctx.restore();
        }
    };
}

// Initialize Charts
function initCharts() {
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false }
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { font: { size: 9 }, maxRotation: 0 }
            },
            y: {
                beginAtZero: false,
                ticks: { font: { size: 9 } }
            }
        },
        elements: {
            point: {
                radius: 2,
                hoverRadius: 4,
                backgroundColor: '#ffffff',
                borderColor: ctx => ctx.dataset.borderColor
            },
            line: {
                borderWidth: 2
            }
        }
    };

    // 1. Temp Chart (Pink)
    tempChart = new Chart(document.getElementById('tempChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [{
                data: tempValues,
                borderColor: '#ec4899',
                tension: 0.25
            }]
        },
        options: commonOptions,
        plugins: [createVerticalBandPlugin('temp', (idx, st, chart) => getAnomalousSensor(idx, st, chart) === 'temp')]
    });

    // 2. Humid Chart (Blue)
    humidChart = new Chart(document.getElementById('humidChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [{
                data: humidValues,
                borderColor: '#3b82f6',
                tension: 0.25
            }]
        },
        options: commonOptions,
        plugins: [createVerticalBandPlugin('humid', (idx, st, chart) => getAnomalousSensor(idx, st, chart) === 'humid')]
    });

    // 3. CO Chart (Black)
    coChart = new Chart(document.getElementById('coChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [{
                data: coValues,
                borderColor: '#111827',
                tension: 0.25
            }]
        },
        options: commonOptions,
        plugins: [createVerticalBandPlugin('co', (idx, st, chart) => getAnomalousSensor(idx, st, chart) === 'co')]
    });
}

// Append new log item
function appendLogItem(logWindowEl, row, limit = 100) {
    const placeholder = logWindowEl.querySelector('.no-log');
    if (placeholder) placeholder.remove();

    const info = getStatusInfo(row.status_code);
    // Parse Supabase UTC created_at and convert to client local time
    const date = new Date(row.created_at);
    const timeStr = date.toLocaleTimeString('ko-KR', { hour12: false });

    const logItem = document.createElement('div');
    logItem.className = `log-item ${info.className}`;
    logItem.innerHTML = `
        <span class="log-time">${timeStr}</span>
        <span>온도: ${row.temperature_c.toFixed(1)}°C | 습도: ${row.humidity_percent.toFixed(1)}% | CO: ${row.co_ppm.toFixed(1)} ppm</span>
        <span style="font-weight: 700;">[${info.text}]</span>
    `;

    logWindowEl.appendChild(logItem);
    
    // Auto-scroll to bottom
    logWindowEl.scrollTop = logWindowEl.scrollHeight;

    // Limit maximum log elements in container
    while (logWindowEl.children.length > limit) {
        logWindowEl.removeChild(logWindowEl.firstChild);
    }
}

// Process new row data
function processRow(row) {
    if (processedIds.has(row.id)) return;
    processedIds.add(row.id);

    if (row.id > lastId) {
        lastId = row.id;
    }

    // Update UI numerical values
    currentTempEl.textContent = `${row.temperature_c.toFixed(1)} °C`;
    currentHumidEl.textContent = `${row.humidity_percent.toFixed(1)} %`;
    currentCoEl.textContent = `${row.co_ppm.toFixed(1)} ppm`;

    // 1. Append to Realtime log
    appendLogItem(rtLogWindowEl, row, 100);
    rtCountEl.textContent = rtLogWindowEl.querySelectorAll('.log-item').length;

    // 2. Append to Event log if warning/danger
    if (row.status_code === 1 || row.status_code === 2) {
        appendLogItem(evtLogWindowEl, row, 100);
    }
    evtCountEl.textContent = evtLogWindowEl.querySelectorAll('.log-item').length;

    // Format time for charts
    const timeStr = new Date(row.created_at).toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    // If the chart is NOT expanded, we update it dynamically
    chartLabels.push(timeStr);
    tempValues.push(row.temperature_c);
    humidValues.push(row.humidity_percent);
    coValues.push(row.co_ppm);
    statusCodes.push(row.status_code);

    // Keep default datasets restricted to MAX_DATA_POINTS (20)
    if (chartLabels.length > MAX_DATA_POINTS) {
        chartLabels.shift();
        tempValues.shift();
        humidValues.shift();
        coValues.shift();
        statusCodes.shift();
    }

    // Update Charts (if they are NOT currently expanded)
    if (tempChart && !chartStates.temp.expanded) tempChart.update();
    if (humidChart && !chartStates.humid.expanded) humidChart.update();
    if (coChart && !chartStates.co.expanded) coChart.update();

    // Danger Event trigger background change
    if (row.status_code === 2) {
        document.body.classList.add('theme-danger');
    } else {
        document.body.classList.remove('theme-danger');
    }

    // Update Time Badge
    timeBadgeEl.textContent = `최근 업데이트: ${timeStr}`;
}

// Toggles chart scale between default (20 logs) and expanded (17,280 logs)
async function toggleChartScale(type) {
    const state = chartStates[type];
    const card = document.getElementById(`${type}-card`);
    const hint = document.getElementById(`${type}-hint`);
    const valueEl = document.getElementById(`current-${type}`);
    const originalText = valueEl.textContent;
    
    if (state.loading) return; // Ignore click if loading

    const chartInstance = (type === 'temp') ? tempChart : (type === 'humid') ? humidChart : coChart;

    if (!state.expanded) {
        // --- 17,280 Logs Expanded State ---
        state.loading = true;
        valueEl.textContent = "불러오는 중...";
        hint.textContent = "로딩 중...";

        try {
            console.log(`Fetching 17,280 logs for ${type}...`);
            const { data, error } = await supabaseClient
                .from('sensor_logs2')
                .select('*')
                .order('id', { ascending: false })
                .limit(17280);

            if (error) throw error;

            if (data && data.length > 0) {
                // Reverse list to display oldest -> newest
                const chronologicalData = data.reverse();
                
                const labels = [];
                const temps = [];
                const humids = [];
                const cos = [];
                const localStatusCodes = [];

                chronologicalData.forEach(row => {
                    const date = new Date(row.created_at);
                    const timeStr = date.toLocaleTimeString('ko-KR', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    });
                    labels.push(timeStr);
                    temps.push(row.temperature_c);
                    humids.push(row.humidity_percent);
                    cos.push(row.co_ppm);
                    localStatusCodes.push(row.status_code);
                });

                // Attach full lists to chart object so Z-score calculator has values
                chartInstance.tempList = temps;
                chartInstance.humidList = humids;
                chartInstance.coList = cos;
                chartInstance.statusCodes = localStatusCodes;

                // Bind correct parameter array to chart dataset
                chartInstance.data.labels = labels;
                if (type === 'temp') {
                    chartInstance.data.datasets[0].data = temps;
                } else if (type === 'humid') {
                    chartInstance.data.datasets[0].data = humids;
                } else {
                    chartInstance.data.datasets[0].data = cos;
                }

                // CRITICAL OPTIMIZATION: Disable points rendering for 17,280 entries to prevent browser freeze!
                chartInstance.options.elements.point.radius = 0;
                chartInstance.options.elements.point.hoverRadius = 0;

                chartInstance.update();

                state.expanded = true;
                card.classList.add('chart-expanded');
                hint.textContent = "클릭 시 축소";
            }
        } catch (err) {
            console.error(`Failed to fetch 17280 logs for ${type}:`, err);
            hint.textContent = "오류 발생";
        } finally {
            state.loading = false;
            // Restore latest current numerical label
            const latestVal = (type === 'temp') ? tempValues[tempValues.length - 1] :
                             (type === 'humid') ? humidValues[humidValues.length - 1] :
                             coValues[coValues.length - 1];
            const unit = (type === 'temp') ? '°C' : (type === 'humid') ? '%' : 'ppm';
            valueEl.textContent = latestVal !== undefined ? `${latestVal.toFixed(1)} ${unit}` : originalText;
        }
    } else {
        // --- 20 Logs Collapsed State ---
        const globalValues = (type === 'temp') ? tempValues : (type === 'humid') ? humidValues : coValues;

        // Restore global datasets
        chartInstance.data.labels = chartLabels;
        chartInstance.data.datasets[0].data = globalValues;

        // Re-enable points rendering for 20 entries
        chartInstance.options.elements.point.radius = 2;
        chartInstance.options.elements.point.hoverRadius = 4;

        // Clear local variables
        chartInstance.tempList = null;
        chartInstance.humidList = null;
        chartInstance.coList = null;
        chartInstance.statusCodes = null;

        chartInstance.update();

        state.expanded = false;
        card.classList.remove('chart-expanded');
        hint.textContent = "클릭 시 24h 확대";
    }
}

// Fetch historical data on startup
async function fetchHistory() {
    try {
        const { data, error } = await supabaseClient
            .from('sensor_logs2')
            .select('*')
            .order('id', { ascending: false })
            .limit(100); // Fetch up to 100 to prefill log lists

        if (error) throw error;

        dbStatusEl.className = 'status-indicator online';

        if (data && data.length > 0) {
            // Reverse list to display chronological order (oldest -> newest)
            const chronologicalData = data.reverse();
            chronologicalData.forEach(row => {
                processRow(row);
            });
        }
    } catch (err) {
        console.error("Failed to load historical data:", err);
        dbStatusEl.className = 'status-indicator offline';
        timeBadgeEl.textContent = "DB 연결 실패";
    }
}

// Real-time listener for new records
function setupRealtime() {
    try {
        supabaseClient
            .channel('schema-db-changes')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'sensor_logs2' },
                payload => {
                    console.log('Realtime INSERT received:', payload.new);
                    processRow(payload.new);
                }
            )
            .subscribe((status) => {
                console.log("Realtime subscription status:", status);
            });
    } catch (err) {
        console.warn("Realtime setup failed, fallback polling active:", err);
    }
}

// Polling fallback to ensure reliability
function startPolling() {
    setInterval(async () => {
        try {
            const { data, error } = await supabaseClient
                .from('sensor_logs2')
                .select('*')
                .gt('id', lastId)
                .order('id', { ascending: true });

            if (error) throw error;

            if (data && data.length > 0) {
                dbStatusEl.className = 'status-indicator online';
                data.forEach(row => {
                    processRow(row);
                });
            }
        } catch (err) {
            console.error("Polling error:", err);
            dbStatusEl.className = 'status-indicator offline';
        }
    }, 2000);
}

// Interactions for Logs & Charts
function setupInteractions() {
    // 1. Collapsible Logs Cards
    rtCard.addEventListener('click', () => {
        rtCard.classList.toggle('expanded');
        rtLogWindowEl.classList.toggle('expanded');
        if (rtLogWindowEl.classList.contains('expanded')) {
            rtHint.textContent = '클릭 시 5줄 축소';
        } else {
            rtHint.textContent = '클릭 시 100줄 확대';
        }
    });

    evtCard.addEventListener('click', () => {
        evtCard.classList.toggle('expanded');
        evtLogWindowEl.classList.toggle('expanded');
        if (evtLogWindowEl.classList.contains('expanded')) {
            evtHint.textContent = '클릭 시 5줄 축소';
        } else {
            evtHint.textContent = '클릭 시 100줄 확대';
        }
    });

    // 2. Expandable Chart Cards
    tempCard.addEventListener('click', () => toggleChartScale('temp'));
    humidCard.addEventListener('click', () => toggleChartScale('humid'));
    coCard.addEventListener('click', () => toggleChartScale('co'));
}

// App Initialization
async function initApp() {
    initCharts();
    setupInteractions();
    await fetchHistory();
    setupRealtime();
    startPolling();
}

// Service Worker Registration for PWA support (disabled on localhost for easier development)
if ('serviceWorker' in navigator && window.location.hostname !== 'localhost') {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registered successfully!', reg.scope))
            .catch(err => console.error('Service Worker registration failed:', err));
    });
}

// Boot
document.addEventListener('DOMContentLoaded', initApp);
