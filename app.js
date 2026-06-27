// Global state
let storeData = {
    summary: {},
    trends: {},
    categories: {},
    locations: {},
    operations: {},
    skus: []
};

// Current active filter states for SKU Catalog
let skuFilters = {
    search: '',
    category: '',
    abcClass: 'All', // 'All', 'A', 'B', 'C'
    currentPage: 1,
    pageSize: 15
};

// Chart instances
let trendChartInstance = null;
let reasonsChartInstance = null;
let linesChartInstance = null;
let assetsChartInstance = null;
let forecastChartInstance = null;

// Initialize Lucide Icons
document.addEventListener("DOMContentLoaded", () => {
    lucide.createIcons();
    initApp();
});

// Navigation handling
const tabs = document.querySelectorAll(".nav-item");
const tabViews = document.querySelectorAll(".tab-view");
const pageTitleText = document.getElementById("page-title-text");

tabs.forEach(tab => {
    tab.addEventListener("click", () => {
        const targetTab = tab.getAttribute("data-tab");
        
        // Update active class on nav links
        tabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        
        // Update active view
        tabViews.forEach(view => {
            view.classList.remove("active");
            if (view.id === `tab-${targetTab}`) {
                view.classList.add("active");
            }
        });
        
        // Update page title in header
        let title = "Store Overview";
        if (targetTab === "inventory") title = "Inventory SKU Catalog";
        if (targetTab === "operations") title = "Operations & Quality Analysis";
        if (targetTab === "lines-assets") title = "Line & Asset Maintenance cost";
        if (targetTab === "forecasts-alerts") title = "Demand Forecasts & Inventory Risks";
        pageTitleText.textContent = title;
        
        // Trigger chart updates to fix resize issues on tab display toggle
        setTimeout(() => {
            if (targetTab === "overview" && trendChartInstance) trendChartInstance.update();
            if (targetTab === "operations" && reasonsChartInstance) reasonsChartInstance.update();
            if (targetTab === "lines-assets") {
                if (linesChartInstance) linesChartInstance.update();
                if (assetsChartInstance) assetsChartInstance.update();
            }
            if (targetTab === "forecasts-alerts" && forecastChartInstance) forecastChartInstance.update();
        }, 100);
    });
});

// App Initialization
async function initApp() {
    try {
        // Load all data
        const urls = [
            'data/summary.json',
            'data/trends.json',
            'data/categories.json',
            'data/locations.json',
            'data/operations.json',
            'data/skus.json'
        ];
        
        const [summary, trends, categories, locations, operations, skus] = await Promise.all(
            urls.map(url => fetch(url).then(res => res.json()))
        );
        
        storeData = { summary, trends, categories, locations, operations, skus };
        
        // Hide loader
        document.getElementById("loader-view").style.display = "none";
        
        // Display System Date (latest timestamp in daily trends or current date)
        if (trends.daily && trends.daily.length > 0) {
            const lastDate = trends.daily[trends.daily.length - 1].date;
            document.getElementById("current-system-time").textContent = `As of: ${lastDate}`;
        }
        
        // Setup dashboard components
        setupOverviewTab();
        setupInventoryTab();
        setupOperationsTab();
        setupLinesAssetsTab();
        setupForecastTab();
        
        // Set sidebar alerts count
        const alertBadge = document.getElementById("alerts-count-badge");
        const anomaliesCount = operations.anomalies ? operations.anomalies.length : 0;
        const risksCount = operations.stockout_risks ? operations.stockout_risks.length : 0;
        const totalAlerts = anomaliesCount + risksCount;
        if (totalAlerts > 0) {
            alertBadge.textContent = totalAlerts;
            alertBadge.style.display = "inline-flex";
        }
        
    } catch (error) {
        console.error("Error loading aggregates:", error);
        document.getElementById("loader-view").innerHTML = `
            <div style="color: var(--accent-rose); font-weight: 600;">
                <i data-lucide="alert-circle" style="display:inline-block; vertical-align:middle; margin-right:8px;"></i>
                Failed to load data. Please ensure aggregate_data.py has run successfully.
            </div>
        `;
        lucide.createIcons();
    }
}

// ----------------- OVERVIEW TAB -----------------
function setupOverviewTab() {
    const kpis = storeData.summary.kpis;
    
    // Format values helper
    const fmtUSD = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
    const fmtNum = (val) => new Intl.NumberFormat('en-US').format(val);
    
    // Fill Cards
    document.getElementById("kpi-consumption").textContent = fmtUSD(kpis.total_issued_value);
    document.getElementById("kpi-qty-issued").textContent = `${fmtNum(kpis.total_qty_issued)} items issued`;
    
    document.getElementById("kpi-replenish").textContent = fmtUSD(kpis.total_grn_value);
    document.getElementById("kpi-qty-received").textContent = `${fmtNum(kpis.total_qty_received)} items received`;
    
    const flowCard = document.getElementById("kpi-flow");
    flowCard.textContent = fmtUSD(kpis.net_inventory_flow);
    if (kpis.net_inventory_flow < 0) {
        flowCard.style.color = "var(--accent-rose)";
    } else {
        flowCard.style.color = "var(--accent-emerald)";
    }
    
    document.getElementById("kpi-reusable-savings").textContent = fmtUSD(kpis.reusable_savings_value);
    document.getElementById("kpi-reusable-pct").textContent = `${kpis.reusable_transactions_pct}% transactions reusable`;
    
    // Populate top categories & locations list
    const catList = document.getElementById("top-cat-list");
    const locList = document.getElementById("top-loc-list");
    catList.innerHTML = "";
    locList.innerHTML = "";
    
    const maxCatVal = storeData.summary.top_categories_by_value[0]?.value || 1;
    storeData.summary.top_categories_by_value.slice(0, 4).forEach(c => {
        const pct = (c.value / maxCatVal) * 100;
        catList.innerHTML += `
            <div style="margin-bottom: 4px;">
                <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom: 2px;">
                    <span style="font-weight:600;">${c.category}</span>
                    <span style="color:var(--text-secondary);">${fmtUSD(c.value)}</span>
                </div>
                <div style="background:var(--bg-tertiary); height:6px; border-radius:3px;">
                    <div style="background:var(--grad-primary); width:${pct}%; height:6px; border-radius:3px;"></div>
                </div>
            </div>
        `;
    });
    
    const maxLocVal = storeData.summary.top_locations_by_value[0]?.value || 1;
    storeData.summary.top_locations_by_value.slice(0, 4).forEach(l => {
        const pct = (l.value / maxLocVal) * 100;
        locList.innerHTML += `
            <div style="margin-bottom: 4px;">
                <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom: 2px;">
                    <span style="font-weight:600;">${l.location_id}</span>
                    <span style="color:var(--text-secondary);">${fmtUSD(l.value)}</span>
                </div>
                <div style="background:var(--bg-tertiary); height:6px; border-radius:3px;">
                    <div style="background:var(--grad-emerald); width:${pct}%; height:6px; border-radius:3px;"></div>
                </div>
            </div>
        `;
    });
    
    // Draw Trends Chart
    drawTrendChart("weekly");
    
    document.getElementById("btn-trend-weekly").addEventListener("click", () => drawTrendChart("weekly"));
    document.getElementById("btn-trend-monthly").addEventListener("click", () => drawTrendChart("monthly"));
}

function drawTrendChart(freq) {
    const dataPoints = storeData.trends[freq] || [];
    const labels = dataPoints.map(d => freq === "weekly" ? d.week : d.month);
    const issuedValues = dataPoints.map(d => d.issued_val);
    const grnValues = dataPoints.map(d => d.grn_val);
    
    const btnWeekly = document.getElementById("btn-trend-weekly");
    const btnMonthly = document.getElementById("btn-trend-monthly");
    
    if (freq === "weekly") {
        btnWeekly.classList.add("active-class");
        btnMonthly.classList.remove("active-class");
    } else {
        btnMonthly.classList.add("active-class");
        btnWeekly.classList.remove("active-class");
    }
    
    if (trendChartInstance) {
        trendChartInstance.destroy();
    }
    
    const ctx = document.getElementById("trendChart").getContext("2d");
    
    // Gradients for line charts
    const gradIssued = ctx.createLinearGradient(0, 0, 0, 300);
    gradIssued.addColorStop(0, 'rgba(99, 102, 241, 0.4)');
    gradIssued.addColorStop(1, 'rgba(99, 102, 241, 0.0)');
    
    const gradGRN = ctx.createLinearGradient(0, 0, 0, 300);
    gradGRN.addColorStop(0, 'rgba(16, 185, 129, 0.4)');
    gradGRN.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

    trendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Consumption (Issued Value)',
                    data: issuedValues,
                    borderColor: '#6366f1',
                    borderWidth: 3,
                    backgroundColor: gradIssued,
                    fill: true,
                    tension: 0.35,
                    pointBackgroundColor: '#6366f1',
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                {
                    label: 'Replenishment (GRN Value)',
                    data: grnValues,
                    borderColor: '#10b981',
                    borderWidth: 3,
                    backgroundColor: gradGRN,
                    fill: true,
                    tension: 0.35,
                    pointBackgroundColor: '#10b981',
                    pointRadius: 4,
                    pointHoverRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#e2e8f0', font: { family: 'Inter', weight: 500 } }
                },
                tooltip: {
                    padding: 12,
                    backgroundColor: '#1e293b',
                    titleColor: '#f8fafc',
                    bodyColor: '#cbd5e1',
                    borderColor: '#475569',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.06)' },
                    ticks: { color: '#94a3b8', font: { family: 'Inter' } }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.06)' },
                    ticks: {
                        color: '#94a3b8',
                        font: { family: 'Inter' },
                        callback: function(value) { return '$' + value.toLocaleString(); }
                    }
                }
            }
        }
    });
}

// ----------------- INVENTORY TAB -----------------
function setupInventoryTab() {
    // Fill category dropdown filter
    const catSelect = document.getElementById("filter-category");
    catSelect.innerHTML = '<option value="">All Categories</option>';
    
    storeData.categories.categories.forEach(c => {
        catSelect.innerHTML += `<option value="${c.category}">${c.category} - (${c.unique_skus_count} SKUs)</option>`;
    });
    
    // Add event listeners for inputs
    document.getElementById("sku-search").addEventListener("input", (e) => {
        skuFilters.search = e.target.value.toLowerCase();
        skuFilters.currentPage = 1;
        renderSkuTable();
    });
    
    catSelect.addEventListener("change", (e) => {
        skuFilters.category = e.target.value;
        skuFilters.currentPage = 1;
        renderSkuTable();
    });
    
    // ABC filter buttons
    const abcBtns = {
        all: document.getElementById("btn-abc-all"),
        a: document.getElementById("btn-abc-a"),
        b: document.getElementById("btn-abc-b"),
        c: document.getElementById("btn-abc-c")
    };
    
    Object.keys(abcBtns).forEach(key => {
        abcBtns[key].addEventListener("click", () => {
            Object.values(abcBtns).forEach(b => b.classList.remove("active-class"));
            abcBtns[key].classList.add("active-class");
            skuFilters.abcClass = key === "all" ? "All" : key.toUpperCase();
            skuFilters.currentPage = 1;
            renderSkuTable();
        });
    });
    
    // Pagination buttons
    document.getElementById("sku-prev-btn").addEventListener("click", () => {
        if (skuFilters.currentPage > 1) {
            skuFilters.currentPage--;
            renderSkuTable();
        }
    });
    
    document.getElementById("sku-next-btn").addEventListener("click", () => {
        const totalItems = getFilteredSkus().length;
        const totalPages = Math.ceil(totalItems / skuFilters.pageSize);
        if (skuFilters.currentPage < totalPages) {
            skuFilters.currentPage++;
            renderSkuTable();
        }
    });
    
    renderSkuTable();
}

function getFilteredSkus() {
    return storeData.skus.filter(s => {
        const matchesSearch = s.sku.toLowerCase().includes(skuFilters.search) || 
                              s.name.toLowerCase().includes(skuFilters.search) ||
                              s.group.toLowerCase().includes(skuFilters.search);
        const matchesCat = skuFilters.category === '' || s.category === skuFilters.category;
        const matchesAbc = skuFilters.abcClass === 'All' || s.abc_class === skuFilters.abcClass;
        return matchesSearch && matchesCat && matchesAbc;
    });
}

function renderSkuTable() {
    const tbody = document.getElementById("sku-table-body");
    tbody.innerHTML = "";
    
    const filtered = getFilteredSkus();
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / skuFilters.pageSize);
    
    // Correct current page boundary
    if (skuFilters.currentPage > totalPages && totalPages > 0) {
        skuFilters.currentPage = totalPages;
    }
    
    const startIdx = (skuFilters.currentPage - 1) * skuFilters.pageSize;
    const endIdx = Math.min(startIdx + skuFilters.pageSize, totalItems);
    const paginated = filtered.slice(startIdx, endIdx);
    
    if (paginated.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:32px; color:var(--text-muted);">No SKUs found matching your filters.</td></tr>`;
        document.getElementById("sku-pagination-info").textContent = "Showing 0 of 0 entries";
        document.getElementById("sku-prev-btn").disabled = true;
        document.getElementById("sku-next-btn").disabled = true;
        return;
    }
    
    const fmtUSD = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    const fmtNum = (val) => new Intl.NumberFormat('en-US').format(val);
    
    paginated.forEach(s => {
        // Find if this SKU is in stockout risk list
        const isRisk = storeData.operations.stockout_risks.some(r => r.sku === s.sku);
        
        let badgesHTML = '';
        if (s.reusable === 1) {
            badgesHTML += `<span class="badge badge-reusable" style="margin-right:4px;"><i data-lucide="recycle" style="width:10px; height:10px; margin-right:3px;"></i>Reusable</span>`;
        }
        if (isRisk) {
            badgesHTML += `<span class="badge badge-risk"><i data-lucide="alert-triangle" style="width:10px; height:10px; margin-right:3px;"></i>Risk</span>`;
        }
        
        tbody.innerHTML += `
            <tr>
                <td style="font-family:monospace; font-weight:600; font-size:12px; color:var(--accent-indigo);">${s.sku}</td>
                <td>
                    <div style="font-weight:600; font-size:13px; max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${s.name}">${s.name}</div>
                    <div style="color:var(--text-muted); font-size:11px;">Group: ${s.group || 'N/A'}</div>
                </td>
                <td><span style="font-weight:500;">${s.category}</span></td>
                <td>${fmtUSD(s.price)}</td>
                <td>${fmtNum(s.issued_qty)}</td>
                <td style="font-weight:600;">${fmtUSD(s.issued_val)}</td>
                <td>${fmtNum(s.grn_qty)}</td>
                <td>
                    <span class="${s.return_rate_pct > 10 ? 'trend-down' : ''}" style="font-weight:500;">
                        ${s.return_rate_pct.toFixed(1)}%
                    </span>
                </td>
                <td>${badgesHTML}</td>
                <td><span class="badge badge-${s.abc_class.toLowerCase()}">Class ${s.abc_class}</span></td>
            </tr>
        `;
    });
    
    // Trigger Lucide icons replacement for badges
    lucide.createIcons();
    
    // Update pagination controls
    document.getElementById("sku-pagination-info").textContent = `Showing ${totalItems > 0 ? startIdx + 1 : 0}-${endIdx} of ${fmtNum(totalItems)} entries`;
    document.getElementById("sku-prev-btn").disabled = skuFilters.currentPage === 1;
    document.getElementById("sku-next-btn").disabled = skuFilters.currentPage === totalPages || totalPages === 0;
}

// ----------------- OPERATIONS & RETURNS TAB -----------------
function setupOperationsTab() {
    // 1. Fill Category Return Table
    const returnBody = document.getElementById("category-return-body");
    returnBody.innerHTML = "";
    
    // Sort categories by return rate
    const categoriesByReturn = [...storeData.categories.categories].sort((a,b) => b.return_rate_pct - a.return_rate_pct);
    
    categoriesByReturn.slice(0, 10).forEach(c => {
        returnBody.innerHTML += `
            <tr>
                <td style="font-weight:600;">${c.category}</td>
                <td>${c.issued_qty.toLocaleString()}</td>
                <td>${c.returns_qty.toLocaleString()}</td>
                <td style="font-weight:600;" class="${c.return_rate_pct > 5 ? 'trend-down' : ''}">
                    ${c.return_rate_pct.toFixed(2)}%
                </td>
            </tr>
        `;
    });
    
    // 2. Draw Order Reason Distribution Bar Chart
    const reasons = storeData.operations.order_reasons;
    const labels = reasons.map(r => r.reason);
    const counts = reasons.map(r => r.count);
    const values = reasons.map(r => r.value);
    
    if (reasonsChartInstance) {
        reasonsChartInstance.destroy();
    }
    
    const ctx = document.getElementById("reasonsChart").getContext("2d");
    reasonsChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Transaction Count',
                    data: counts,
                    backgroundColor: 'rgba(99, 102, 241, 0.85)',
                    borderColor: '#6366f1',
                    borderWidth: 1.5,
                    borderRadius: 6,
                    yAxisID: 'y'
                },
                {
                    label: 'Sub Total Value ($)',
                    data: values,
                    backgroundColor: 'rgba(245, 158, 11, 0.85)',
                    borderColor: '#f59e0b',
                    borderWidth: 1.5,
                    borderRadius: 6,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#e2e8f0', font: { family: 'Inter', weight: 500 } }
                },
                tooltip: {
                    padding: 12,
                    backgroundColor: '#1e293b'
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8', font: { family: 'Inter' } }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    grid: { color: 'rgba(255,255,255,0.06)' },
                    ticks: { color: '#94a3b8' },
                    title: { display: true, text: 'Transactions', color: '#94a3b8' }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#94a3b8', callback: function(value) { return '$' + value.toLocaleString(); } },
                    title: { display: true, text: 'Cost ($)', color: '#94a3b8' }
                }
            }
        }
    });
}

// ----------------- LINES & ASSETS TAB -----------------
function setupLinesAssetsTab() {
    const lines = storeData.locations.lines.slice(0, 10);
    const assets = storeData.locations.assets.slice(0, 10);
    
    // 1. Draw Lines Consumption Chart
    if (linesChartInstance) linesChartInstance.destroy();
    
    const ctxLines = document.getElementById("linesChart").getContext("2d");
    linesChartInstance = new Chart(ctxLines, {
        type: 'bar',
        data: {
            labels: lines.map(l => l.line_name),
            datasets: [{
                label: 'Maintenance Cost ($)',
                data: lines.map(l => l.issued_val),
                backgroundColor: 'rgba(6, 182, 212, 0.8)',
                borderColor: '#06b6d4',
                borderWidth: 1.5,
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { backgroundColor: '#1e293b' }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.06)' },
                    ticks: { color: '#94a3b8', callback: function(val) { return '$' + val.toLocaleString(); } }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8', font: { family: 'Inter', weight: 600 } }
                }
            }
        }
    });
    
    // 2. Draw Assets Maintenance Chart
    if (assetsChartInstance) assetsChartInstance.destroy();
    
    const ctxAssets = document.getElementById("assetsChart").getContext("2d");
    assetsChartInstance = new Chart(ctxAssets, {
        type: 'bar',
        data: {
            labels: assets.map(a => a.asset_name.length > 25 ? a.asset_name.substring(0, 25) + '...' : a.asset_name),
            datasets: [{
                label: 'Spare Parts Cost ($)',
                data: assets.map(a => a.issued_val),
                backgroundColor: 'rgba(168, 85, 247, 0.8)',
                borderColor: '#a855f7',
                borderWidth: 1.5,
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { backgroundColor: '#1e293b' }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.06)' },
                    ticks: { color: '#94a3b8', callback: function(val) { return '$' + val.toLocaleString(); } }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8', font: { family: 'Inter', weight: 600 } }
                }
            }
        }
    });

    // 3. Fill Assembly Lines Master List Table
    const tbody = document.getElementById("lines-table-body");
    tbody.innerHTML = "";
    
    storeData.locations.lines.forEach(l => {
        tbody.innerHTML += `
            <tr>
                <td style="font-weight:700; color:var(--accent-cyan);">${l.line_name}</td>
                <td>${l.tx_count.toLocaleString()}</td>
                <td>${l.issued_qty.toLocaleString()}</td>
                <td style="font-weight:600;">$${l.issued_val.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td><span class="badge badge-c">${l.main_category}</span> <span style="font-size:11px; color:var(--text-muted); font-weight:600;">$${l.main_category_value.toLocaleString(undefined, {maximumFractionDigits: 0})}</span></td>
                <td><div style="font-size:12px; font-weight:500; max-width:250px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${l.main_asset}">${l.main_asset}</div> <span style="font-size:11px; color:var(--text-muted); font-weight:600;">$${l.main_asset_value.toLocaleString(undefined, {maximumFractionDigits: 0})}</span></td>
            </tr>
        `;
    });
}

// ----------------- FORECASTS & RISKS TAB -----------------
function setupForecastTab() {
    // 1. Draw Forecast Chart
    const needleHistory = storeData.trends.needle_history || [];
    const needleForecast = storeData.trends.needle_forecast || [];
    
    const labels = [...needleHistory.map(h => h.week), ...needleForecast.map(f => f.week)];
    const histData = needleHistory.map(h => h.qty);
    // Forecast data overlaps with the last point of history for visual continuity
    const forecastData = Array(needleHistory.length - 1).fill(null);
    forecastData.push(histData[histData.length - 1]);
    needleForecast.forEach(f => forecastData.push(f.projected_qty));
    
    if (forecastChartInstance) forecastChartInstance.destroy();
    
    const ctx = document.getElementById("needleForecastChart").getContext("2d");
    forecastChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Historical Weekly Demand (Needles)',
                    data: histData,
                    borderColor: '#3b82f6',
                    borderWidth: 3,
                    fill: false,
                    tension: 0.3,
                    pointBackgroundColor: '#3b82f6'
                },
                {
                    label: 'Linear Projection Forecast',
                    data: forecastData,
                    borderColor: '#f43f5e',
                    borderWidth: 3,
                    borderDash: [6, 6],
                    fill: false,
                    tension: 0.3,
                    pointBackgroundColor: '#f43f5e'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#e2e8f0' } }
            },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#94a3b8' } },
                y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#94a3b8' } }
            }
        }
    });

    // 2. Populate Anomalies
    const anomalyContainer = document.getElementById("anomalies-list-container");
    anomalyContainer.innerHTML = "";
    
    const anomalies = storeData.operations.anomalies || [];
    if (anomalies.length === 0) {
        anomalyContainer.innerHTML = `<div style="padding:24px; text-align:center; color:var(--text-muted); font-size:14px;">No anomalies detected. Operations are stable!</div>`;
    } else {
        anomalies.forEach(a => {
            anomalyContainer.innerHTML += `
                <div class="anomaly-item">
                    <div>
                        <div class="anomaly-title">${a.line_name}</div>
                        <div class="anomaly-meta">Week starting ${a.week_start} • Expected Average: $${a.expected_mean.toLocaleString()}</div>
                    </div>
                    <div style="text-align: right;">
                        <div class="anomaly-value">$${a.actual_value.toLocaleString()}</div>
                        <div style="font-size:11px; font-weight:700;" class="trend-down">+${a.deviation_pct}% spike</div>
                    </div>
                </div>
            `;
        });
    }

    // 3. Populate Stockout Risks Table
    const tbody = document.getElementById("stockout-table-body");
    tbody.innerHTML = "";
    
    const risks = storeData.operations.stockout_risks || [];
    if (risks.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:32px; color:var(--text-muted);">No stockout risks detected. All active parts are replenished.</td></tr>`;
    } else {
        risks.forEach(r => {
            tbody.innerHTML += `
                <tr>
                    <td style="font-family:monospace; font-weight:600; font-size:12px; color:var(--accent-indigo);">${r.sku}</td>
                    <td style="font-weight:600; font-size:13px;">${r.name}</td>
                    <td>${r.category}</td>
                    <td>$${r.price.toFixed(2)}</td>
                    <td>${r.total_issued_qty.toLocaleString()}</td>
                    <td style="font-weight:600;">$${r.total_issued_val.toLocaleString()}</td>
                    <td style="font-weight:600; color:var(--accent-amber);">${r.recent_issued_qty.toLocaleString()} items</td>
                    <td><span class="badge badge-${r.abc_class.toLowerCase()}">Class ${r.abc_class}</span></td>
                    <td><span class="badge badge-risk">CRITICAL RISK</span></td>
                </tr>
            `;
        });
    }
}
