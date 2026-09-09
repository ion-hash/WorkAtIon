/**
 * Jumbo Shopping Assistant - Background Service Worker
 *
 * Persists product data across page navigations within the session.
 * Handles search requests from the popup by navigating the active tab.
 * Accumulates products from multiple searches.
 */

let productCache = {
    products: [],
    lastUrl: '',
    lastTitle: '',
    lastUpdated: null
};

// Accumulate products across searches (keyed by search term)
let allScannedProducts = {};

// Listen for products found by the content script
browser.runtime.onMessage.addListener((message, sender) => {
    if (message.type === 'PRODUCTS_FOUND') {
        productCache = {
            products: message.products,
            lastUrl: message.url,
            lastTitle: message.title,
            lastUpdated: new Date().toISOString()
        };

        // Extract search term from URL
        const urlMatch = message.url.match(/searchTerms=([^&]+)/);
        if (urlMatch) {
            const term = decodeURIComponent(urlMatch[1]).replace(/\+/g, ' ');
            allScannedProducts[term] = message.products;
        }

        console.log('[Jumbo Assistant] Products found:', message.count, 'for URL:', message.url);
        console.log('[Jumbo Assistant] All searched terms:', Object.keys(allScannedProducts));

        // Broadcast to popup if it's open
        browser.runtime.sendMessage({
            type: 'PRODUCTS_UPDATED',
            cache: productCache,
            allScanned: allScannedProducts
        }).catch(() => {
            // Popup might not be open, that's fine
        });

        // Also broadcast via Webfuse session so other participants see it
        if (browser.webfuseSession && browser.webfuseSession.broadcastMessage) {
            browser.webfuseSession.broadcastMessage({
                type: 'PRODUCTS_UPDATED',
                count: productCache.products.length,
                url: productCache.lastUrl,
                allTerms: Object.keys(allScannedProducts)
            });
        }
    }
});

// Handle requests from popup
browser.runtime.onMessage.addListener((message, sender) => {
    if (message.type === 'GET_CACHED_PRODUCTS') {
        return Promise.resolve({ cache: productCache, allScanned: allScannedProducts });
    }

    if (message.type === 'REQUEST_EXTRACTION') {
        // Ask the active content script to extract products
        browser.tabs.sendMessage(null, {
            type: 'EXTRACT_PRODUCTS',
            autoScroll: message.autoScroll
        }).catch(() => {
            // No content script active
        });
        return Promise.resolve({ requested: true });
    }

    if (message.type === 'REQUEST_SEARCH') {
        // Forward search to the active content script which will navigate
        browser.tabs.sendMessage(null, {
            type: 'SEARCH_PRODUCT',
            query: message.query
        }).catch(() => {
            // No content script active, navigate directly via session API
            if (browser.webfuseSession) {
                const searchTerm = encodeURIComponent(message.query);
                browser.webfuseSession.apiRequest({
                    cmd: 'relocate',
                    url: 'https://www.jumbo.com/producten/?searchType=keyword&searchTerms=' + searchTerm,
                    newTab: false
                });
            }
        });
        return Promise.resolve({ searching: true, query: message.query });
    }

    if (message.type === 'SEARCH_MULTIPLE') {
        // Search for multiple items sequentially
        const items = message.items || [];
        let index = 0;

        function searchNext() {
            if (index >= items.length) {
                // All searches done, broadcast final results
                browser.runtime.sendMessage({
                    type: 'ALL_SEARCHES_DONE',
                    allScanned: allScannedProducts
                }).catch(() => {});
                return;
            }

            const item = items[index];
            console.log('[Jumbo Assistant] Searching for:', item, '(' + (index + 1) + '/' + items.length + ')');

            // Navigate to Jumbo search
            if (browser.webfuseSession) {
                const searchTerm = encodeURIComponent(item);
                browser.webfuseSession.apiRequest({
                    cmd: 'relocate',
                    url: 'https://www.jumbo.com/producten/?searchType=keyword&searchTerms=' + searchTerm,
                    newTab: false
                });
            }

            // Broadcast progress to popup
            browser.runtime.sendMessage({
                type: 'SEARCH_PROGRESS',
                current: item,
                index: index + 1,
                total: items.length
            }).catch(() => {});

            index++;
            // Wait for page to load and products to be extracted before next search
            setTimeout(searchNext, 8000);
        }

        searchNext();
        return Promise.resolve({ started: true, items: items });
    }

    if (message.type === 'GET_ALL_SCANNED') {
        return Promise.resolve(allScannedProducts);
    }
});

// Listen for session navigation events to auto-trigger extraction
browser.webfuseSession.on.addListener((payload) => {
    if (payload.event_type === 'tab_relocated') {
        console.log('[Jumbo Assistant] Page navigated to:', payload.url);
        // The content script will auto-extract on the new page
    }
});
