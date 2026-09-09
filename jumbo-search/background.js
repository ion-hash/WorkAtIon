/**
 * Jumbo Product Search - Background Service Worker
 *
 * Handles search requests, accumulates products across searches.
 */

let productCache = { products: [], lastUrl: '', lastTitle: '', lastUpdated: null };
let allScannedProducts = {};

browser.runtime.onMessage.addListener((message, sender) => {
    if (message.type === 'PRODUCTS_FOUND') {
        productCache = {
            products: message.products,
            lastUrl: message.url,
            lastTitle: message.title,
            lastUpdated: new Date().toISOString()
        };

        const urlMatch = message.url.match(/searchTerms=([^&]+)/);
        if (urlMatch) {
            const term = decodeURIComponent(urlMatch[1]).replace(/\+/g, ' ');
            allScannedProducts[term] = message.products;
        }

        browser.runtime.sendMessage({
            type: 'PRODUCTS_UPDATED',
            cache: productCache,
            allScanned: allScannedProducts
        }).catch(() => {});

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

browser.runtime.onMessage.addListener((message, sender) => {
    if (message.type === 'GET_CACHED_PRODUCTS') {
        return Promise.resolve({ cache: productCache, allScanned: allScannedProducts });
    }

    if (message.type === 'REQUEST_EXTRACTION') {
        browser.tabs.sendMessage(null, { type: 'EXTRACT_PRODUCTS', autoScroll: message.autoScroll }).catch(() => {});
        return Promise.resolve({ requested: true });
    }

    if (message.type === 'REQUEST_SEARCH') {
        browser.tabs.sendMessage(null, { type: 'SEARCH_PRODUCT', query: message.query }).catch(() => {
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
        const items = message.items || [];
        let index = 0;

        function searchNext() {
            if (index >= items.length) {
                browser.runtime.sendMessage({ type: 'ALL_SEARCHES_DONE', allScanned: allScannedProducts }).catch(() => {});
                return;
            }

            const item = items[index];
            if (browser.webfuseSession) {
                const searchTerm = encodeURIComponent(item);
                browser.webfuseSession.apiRequest({
                    cmd: 'relocate',
                    url: 'https://www.jumbo.com/producten/?searchType=keyword&searchTerms=' + searchTerm,
                    newTab: false
                });
            }

            browser.runtime.sendMessage({
                type: 'SEARCH_PROGRESS',
                current: item,
                index: index + 1,
                total: items.length
            }).catch(() => {});

            index++;
            setTimeout(searchNext, 8000);
        }

        searchNext();
        return Promise.resolve({ started: true, items: items });
    }

    if (message.type === 'GET_ALL_SCANNED') {
        return Promise.resolve(allScannedProducts);
    }
});

browser.webfuseSession.on.addListener((payload) => {
    if (payload.event_type === 'tab_relocated') {
        console.log('[Jumbo Search] Page navigated to:', payload.url);
    }
});
