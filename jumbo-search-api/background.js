/**
 * Jumbo Search API - Background Service Worker
 *
 * Caches search results across navigations.
 */

let searchCache = {};

browser.runtime.onMessage.addListener((message, sender) => {
    if (message.type === 'SEARCH_RESULTS') {
        searchCache[message.query] = {
            products: message.products,
            url: message.url,
            timestamp: new Date().toISOString()
        };

        browser.runtime.sendMessage({
            type: 'CACHE_UPDATED',
            cache: searchCache
        }).catch(() => {});
    }

    if (message.type === 'GET_CACHE') {
        return Promise.resolve(searchCache);
    }
});
