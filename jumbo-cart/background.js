/**
 * Jumbo Cart Adder - Background Service Worker
 *
 * Routes add-to-cart requests from popup to the content script.
 * Tracks cart history.
 */

let cartHistory = [];

browser.runtime.onMessage.addListener((message, sender) => {
    if (message.type === 'ADD_TO_CART') {
        return browser.tabs.sendMessage(null, {
            type: 'ADD_TO_CART',
            selector: message.selector,
            quantity: message.quantity
        }).then((result) => {
            if (result && result.success) {
                cartHistory.push({
                    selector: message.selector,
                    quantity: message.quantity,
                    timestamp: result.timestamp,
                    cartCount: result.cartCount
                });
            }

            browser.runtime.sendMessage({
                type: 'CART_UPDATED',
                result: result,
                history: cartHistory
            }).catch(() => {});

            return result;
        }).catch(() => {
            return { success: false, error: 'No content script active on a Jumbo page' };
        });
    }

    if (message.type === 'GET_CART_HISTORY') {
        return Promise.resolve({ history: cartHistory });
    }

    if (message.type === 'GET_CART_COUNT') {
        return browser.tabs.sendMessage(null, { type: 'GET_CART_COUNT' }).catch(() => {
            return { cartCount: null };
        });
    }
});

browser.webfuseSession.on.addListener((payload) => {
    if (payload.event_type === 'tab_relocated') {
        console.log('[Jumbo Cart] Page navigated to:', payload.url);
    }
});
