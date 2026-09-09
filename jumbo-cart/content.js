/**
 * Jumbo Cart Adder - Content Script
 *
 * Runs inside every Jumbo page. Handles add-to-cart requests
 * by clicking the specified button selector.
 */

(function () {
    'use strict';

    browser.runtime.onMessage.addListener((message, sender) => {
        if (message.type === 'ADD_TO_CART') {
            const selector = message.selector;
            const quantity = message.quantity || 1;

            try {
                const btn = document.querySelector(selector);
                if (!btn) {
                    return Promise.resolve({
                        success: false,
                        error: 'Button not found with selector: ' + selector
                    });
                }

                // Scroll the button into view first
                btn.scrollIntoView({ behavior: 'smooth', block: 'center' });

                return new Promise((resolve) => {
                    setTimeout(() => {
                        btn.click();

                        // Wait for cart to update
                        setTimeout(() => {
                            // Check cart badge
                            const cartBadge = document.querySelector(
                                '[class*="cart-count"], .cart-count, [data-cart-count], ' +
                                '[class*="header__cart"], [class*="mini-cart"]'
                            );
                            let cartCount = null;
                            if (cartBadge) {
                                const match = (cartBadge.textContent || '').match(/\d+/);
                                if (match) cartCount = parseInt(match[0]);
                            }

                            // Handle quantity > 1
                            if (quantity > 1) {
                                const qtyInput = document.querySelector(
                                    'input[type="number"][class*="quantity"], ' +
                                    'input[type="text"][class*="quantity"], ' +
                                    'input[class*="amount"]'
                                );
                                if (qtyInput) {
                                    qtyInput.value = quantity;
                                    qtyInput.dispatchEvent(new Event('input', { bubbles: true }));
                                    qtyInput.dispatchEvent(new Event('change', { bubbles: true }));
                                } else {
                                    // Click the add button additional times
                                    for (let i = 1; i < quantity; i++) {
                                        setTimeout(() => btn.click(), i * 800);
                                    }
                                }
                            }

                            resolve({
                                success: true,
                                selector: selector,
                                cartCount: cartCount,
                                quantity: quantity,
                                timestamp: new Date().toISOString()
                            });
                        }, 2000);
                    }, 500);
                });
            } catch (err) {
                return Promise.resolve({ success: false, error: err.message });
            }
        }

        if (message.type === 'GET_CART_COUNT') {
            const cartBadge = document.querySelector(
                '[class*="cart-count"], .cart-count, [data-cart-count], ' +
                '[class*="header__cart"], [class*="mini-cart"]'
            );
            let cartCount = null;
            if (cartBadge) {
                const match = (cartBadge.textContent || '').match(/\d+/);
                if (match) cartCount = parseInt(match[0]);
            }
            return Promise.resolve({ cartCount: cartCount, url: window.location.href });
        }
    });
})();
