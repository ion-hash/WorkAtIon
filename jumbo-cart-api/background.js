/**
 * Jumbo Cart API - Background Service Worker
 *
 * Tracks cart actions history.
 */

let cartHistory = [];

browser.runtime.onMessage.addListener((message, sender) => {
    if (message.type === 'CART_ACTION') {
        cartHistory.push(message);

        browser.runtime.sendMessage({
            type: 'HISTORY_UPDATED',
            history: cartHistory
        }).catch(() => {});
    }

    if (message.type === 'GET_HISTORY') {
        return Promise.resolve({ history: cartHistory });
    }
});
