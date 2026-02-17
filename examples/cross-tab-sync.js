import { FetchPlus } from '../src/index.ts';

// Initialize FetchPlus with cross-tab sync enabled
const fetchPlus = new FetchPlus({
    enableCaching: true,
    enableSync: true, // Enable cross-tab synchronization
    syncChannelName: 'fetchplus-demo-sync',
    cacheOptions: {
        ttl: 60000 // 1 minute
    }
});

fetchPlus.init();

const output = document.getElementById('output');
const syncStatus = document.getElementById('sync-status');

function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const className = type === 'error' ? 'error' : type === 'success' ? 'success' : type === 'warning' ? 'warning' : '';
    output.innerHTML += `<div class="${className}"><span class="timestamp">[${timestamp}]</span> ${message}</div>`;
    output.scrollTop = output.scrollHeight;
}

// Update sync status
if (fetchPlus.isSyncAvailable()) {
    syncStatus.textContent = '✓ Sync Enabled';
    syncStatus.className = 'sync-status sync-enabled';
    log('✅ Cross-tab sync is enabled!', 'success');
} else {
    syncStatus.textContent = '✗ Sync Not Available';
    syncStatus.className = 'sync-status sync-disabled';
    log('⚠️ BroadcastChannel not available', 'warning');
}

window.fetchAndCache = async function () {
    log('🌐 Fetching data from API...');
    try {
        const response = await fetchPlus.fetch('https://jsonplaceholder.typicode.com/posts/1');
        const data = await response.json();
        log(`✅ Data fetched and cached: ${data.title}`, 'success');
        log(`📦 Cache synced to other tabs!`, 'success');
    } catch (error) {
        log(`❌ Error: ${error.message}`, 'error');
    }
};

window.fetchWithRefresh = async function () {
    log('🔄 Force refreshing data (bypassing cache)...');
    try {
        const response = await fetchPlus.fetch('https://jsonplaceholder.typicode.com/posts/1', {
            forceRefresh: true // Force a fresh network request
        });
        const data = await response.json();
        log(`✅ Fresh data fetched: ${data.title}`, 'success');
        log(`📦 Cache updated and synced!`, 'success');
    } catch (error) {
        log(`❌ Error: ${error.message}`, 'error');
    }
};

window.readFromCache = async function () {
    log('📖 Attempting to read from cache...');
    try {
        const response = await fetchPlus.fetch('https://jsonplaceholder.typicode.com/posts/1');
        const data = await response.json();
        log(`✅ Data loaded: ${data.title}`, 'success');
    } catch (error) {
        log(`❌ Error: ${error.message}`, 'error');
    }
};

window.clearCache = async function () {
    log('🗑️ Clearing cache...');
    await fetchPlus.clearCache();
    log('✅ Cache cleared in all tabs!', 'success');
};

// Listen for cache sync events
log('👂 Listening for sync events from other tabs...', 'warning');
