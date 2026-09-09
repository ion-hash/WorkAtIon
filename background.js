/**
 * Jumbo Shopping Assistant - Background Service Worker
 *
 * Persists product data across page navigations within the session.
 * Receives products from content script, stores them, and serves them
 * to the popup on demand.
 */

let productCache = {
    products: [],
    lastUrl: '',
    lastTitle: '',
    lastUpdated: null
};

// Listen for products found by the content script
browser.runtime.onMessage.addListener((message, sender) => {
    if (message.type === 'PRODUCTS_FOUND') {
        productCache = {
            products: message.products,
            lastUrl: message.url,
            lastTitle: message.title,
            lastUpdated: new Date().toISOString()
        };

        // Broadcast to popup if it's open
        browser.runtime.sendMessage({
            type: 'PRODUCTS_UPDATED',
            cache: productCache
        }).catch(() => {
            // Popup might not be open, that's fine
        });

        // Also broadcast via Webfuse session so other participants see it
        if (browser.webfuseSession && browser.webfuseSession.broadcastMessage) {
            browser.webfuseSession.broadcastMessage({
                type: 'PRODUCTS_UPDATED',
                count: productCache.products.length,
                url: productCache.lastUrl
            });
        }
    }
});

// Handle requests from popup
browser.runtime.onMessage.addListener((message, sender) => {
    if (message.type === 'GET_CACHED_PRODUCTS') {
        return Promise.resolve(productCache);
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
});

// Listen for session navigation events to auto-trigger extraction
browser.webfuseSession.on.addListener((payload) => {
    if (payload.event_type === 'tab_relocated') {
        console.log('[Jumbo Assistant] Page navigated to:', payload.url);
        // The content script will auto-extract on the new page
    }
});
