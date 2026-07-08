// Supabase Config (embedded directly for public web app access)
const SUPABASE_URL = "https://voeijjbnjvcchcryynhe.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZvZWlqamJuanZjY2hjcnl5bmhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0NTg0NTAsImV4cCI6MjA5OTAzNDQ1MH0.JyBXojePPs3tziXIRfLv0UMWu5dVWKdptKcJ3pQ3TsY";

// Initialize Supabase Client
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// State Variables
const processedIds = new Set();
let lastId = 0;
const MAX_DATA_POINTS = 30;

// Data structures for charts
const chartLabels = [];
const tempValues = [];
const humidValues = [];
const coValues = [];
const statusCodes = []; // To store status for segment color calculation

// Chart Instances
let tempChart, humidChart, coChart;

// DOM Elements
const dbStatusEl = document.getElementById('db-status');
const timeBadgeEl = document.getElementById('time-badge');
const logWindowEl = document.getElementById('log-window');
const currentTempEl = document.getElementById('current-temp');
const currentHumidEl = document.getElementById('current-humid');
const currentCoEl = document.getElementById('current-co');
const logCountEl = document.getElementById('log-count');

// Helper to determine status description
function getStatusInfo(statusCode) {
    if (statusCode === 2) return { text: "위험", className: "status-danger" };
    if (statusCode === 1) return { text: "경고", className: "status-warning" };
    return { text: "정상", className: "status-normal" };
}

// Chart Segment Coloring Rule
function getSegmentColorRule(defaultColor) {
    return {
        borderColor: ctx => {
            if (ctx.p0DataIndex === undefined || ctx.p1DataIndex === undefined) return defaultColor;
            // Get the statuses at the start and end of this line segment
            const s0 = statusCodes[ctx.p0DataIndex];
            const s1 = statusCodes[ctx.p1DataIndex];
            const maxStatus = Math.max(s0 || 0, s1 || 0);
            
            if (maxStatus === 2) return '#ef4444'; // Red for Danger segment
            if (maxStatus === 1) return '#f97316'; // Orange for Warning segment
            return defaultColor;
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
                backgroundColor: ctx => {
                    const idx = ctx.dataIndex;
                    const st = statusCodes[idx];
                    if (st === 2) return '#ef4444';
                    if (st === 1) return '#f97316';
                    return '#ffffff';
                },
                borderColor: ctx => {
                    const idx = ctx.dataIndex;
                    const st = statusCodes[idx];
                    if (st === 2) return '#ef4444';
                    if (st === 1) return '#f97316';
                    return ctx.dataset.borderColor;
                }
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
                segment: getSegmentColorRule('#ec4899'),
                tension: 0.25
            }]
        },
        options: commonOptions
    });

    // 2. Humid Chart (Blue)
    humidChart = new Chart(document.getElementById('humidChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [{
                data: humidValues,
                borderColor: '#3b82f6',
                segment: getSegmentColorRule('#3b82f6'),
                tension: 0.25
            }]
        },
        options: commonOptions
    });

    // 3. CO Chart (Black)
    coChart = new Chart(document.getElementById('coChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [{
                data: coValues,
                borderColor: '#111827',
                segment: getSegmentColorRule('#111827'),
                tension: 0.25
            }]
        },
        options: commonOptions
    });
}

// Append new log item
function appendLog(row) {
    // Remove empty placeholder
    const placeholder = logWindowEl.querySelector('.no-log');
    if (placeholder) placeholder.remove();

    const info = getStatusInfo(row.status_code);
    const date = new Date(row.created_at);
    const timeStr = date.toLocaleTimeString('ko-KR', { hour12: false });

    const logItem = document.createElement('div');
    logItem.className = `log-item ${info.className}`;
    logItem.innerHTML = `
        <span class="log-time">${timeStr}</span>
        <span>온도: ${row.temperature_c}°C | 습도: ${row.humidity_percent}% | CO: ${row.co_ppm} ppm</span>
        <span style="font-weight: 700;">[${info.text}]</span>
    `;

    logWindowEl.appendChild(logItem);
    logWindowEl.scrollTop = logWindowEl.scrollHeight;

    // Update log counter badge
    logCountEl.textContent = processedIds.size;
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

    // Append to Log Window
    appendLog(row);

    // Format time for charts
    const timeStr = new Date(row.created_at).toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    // Add to chart datasets
    chartLabels.push(timeStr);
    tempValues.push(row.temperature_c);
    humidValues.push(row.humidity_percent);
    coValues.push(row.co_ppm);
    statusCodes.push(row.status_code);

    // Keep arrays under MAX_DATA_POINTS limits
    if (chartLabels.length > MAX_DATA_POINTS) {
        chartLabels.shift();
        tempValues.shift();
        humidValues.shift();
        coValues.shift();
        statusCodes.shift();
    }

    // Update Charts
    if (tempChart) tempChart.update();
    if (humidChart) humidChart.update();
    if (coChart) coChart.update();

    // Danger Event trigger background change
    if (row.status_code === 2) {
        document.body.classList.add('theme-danger');
    } else {
        document.body.classList.remove('theme-danger');
    }

    // Update Time Badge
    timeBadgeEl.textContent = `최근 업데이트: ${timeStr}`;
}

// Fetch historical data on startup
async function fetchHistory() {
    try {
        const { data, error } = await supabaseClient
            .from('sensor_logs2')
            .select('*')
            .order('id', { ascending: false })
            .limit(MAX_DATA_POINTS);

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

// App Initialization
async function initApp() {
    initCharts();
    await fetchHistory();
    setupRealtime();
    startPolling();
}

// Service Worker Registration for PWA support
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registered successfully!', reg.scope))
            .catch(err => console.error('Service Worker registration failed:', err));
    });
}

// Boot
document.addEventListener('DOMContentLoaded', initApp);
