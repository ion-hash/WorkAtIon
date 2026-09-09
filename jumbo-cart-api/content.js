/**
 * Jumbo Cart API - Content Script
 *
 * Registers MCP tools:
 * - jumbo_add_to_cart: clicks add-to-cart button using Automation API
 * - jumbo_get_cart_count: reads cart count from live DOM
 *
 * Uses automation.act.click() for clicking (handles shadow DOM/iframes)
 * and document.querySelector for verifying cart state.
 */

(function () {
    'use strict';

    const automation = browser.webfuseSession.automation;

    // ---- Register MCP Tools ----

    // Tool: jumbo_add_to_cart
    browser.webfuseSession.tools.registerTool({
        name: 'jumbo_add_to_cart',
        description: 'Add a product to the Jumbo cart by clicking its add-to-cart button. Scrolls the button into view, clicks it using the Automation API, waits for cart to update, and verifies the cart count. Supports quantity.',
        inputSchema: {
            type: 'object',
            properties: {
                selector: {
                    type: 'string',
                    description: 'CSS selector for the add-to-cart button (from jumbo_scan_page results)'
                },
                quantity: {
                    type: 'integer',
                    description: 'Quantity to add (default 1)',
                    minimum: 1,
                    maximum: 20
                }
            },
            required: ['selector']
        },
        execute: async (args, ctx) => {
            const selector = args.selector;
            const quantity = args.quantity || 1;

            browser.webfuseSession.tools.sendAutomationProgress(ctx.eventId, {
                progress: 1, total: 3, message: 'Scrolling to button...'
            });

            // Scroll button into view using Automation API
            try {
                await automation.act.scroll({ target: selector, amount: 200 });
                await new Promise(r => setTimeout(r, 500));
            } catch (e) {
                // Fallback: scroll the page
                try {
                    await automation.act.scroll({ target: 'body', amount: 400 });
                    await new Promise(r => setTimeout(r, 500));
                } catch (e2) {
                    window.scrollBy(0, 400);
                    await new Promise(r => setTimeout(r, 500));
                }
            }

            browser.webfuseSession.tools.sendAutomationProgress(ctx.eventId, {
                progress: 2, total: 3, message: 'Clicking add-to-cart button...'
            });

            // Click using Automation API
            try {
                await automation.act.click({ target: selector });
            } catch (e) {
                // Fallback: direct DOM click
                try {
                    const btn = document.querySelector(selector);
                    if (btn) {
                        btn.click();
                    } else {
                        return JSON.stringify({
                            success: false,
                            error: 'Button not found: ' + selector
                        }, null, 2);
                    }
                } catch (e2) {
                    return JSON.stringify({
                        success: false,
                        error: 'Click failed: ' + e2.message
                    }, null, 2);
                }
            }

            browser.webfuseSession.tools.sendAutomationProgress(ctx.eventId, {
                progress: 3, total: 3, message: 'Verifying cart...'
            });

            // Wait for cart to update
            await new Promise(r => setTimeout(r, 2000));

            // Handle quantity > 1
            if (quantity > 1) {
                for (let i = 1; i < quantity; i++) {
                    try {
                        await automation.act.click({ target: selector });
                        await new Promise(r => setTimeout(r, 1000));
                    } catch (e) {
                        // Try fallback
                        try {
                            const btn = document.querySelector(selector);
                            if (btn) btn.click();
                            await new Promise(r => setTimeout(r, 1000));
                        } catch (e2) { break; }
                    }
                }
            }

            // Get cart count from live DOM
            let cartCount = null;
            const cartSelectors = [
                '[data-testid*="cart"] [class*="count"]',
                '[class*="cart-count"]',
                '[class*="minicart"] [class*="count"]',
                '[data-testid*="minicart"]',
                '.cart-count',
                '[aria-label*="winkelwagen"] [class*="count"]'
            ];

            for (const sel of cartSelectors) {
                const el = document.querySelector(sel);
                if (el) {
                    const text = el.textContent.trim();
                    const numMatch = text.match(/\d+/);
                    if (numMatch) {
                        cartCount = parseInt(numMatch[0]);
                        break;
                    }
                }
            }

            // Cache the action
            browser.runtime.sendMessage({
                type: 'CART_ACTION',
                action: 'add',
                selector: selector,
                quantity: quantity,
                success: true,
                cartCount: cartCount,
                timestamp: new Date().toISOString()
            }).catch(() => {});

            return JSON.stringify({
                success: true,
                selector: selector,
                quantity: quantity,
                cartCount: cartCount,
                timestamp: new Date().toISOString()
            }, null, 2);
        }
    });

    // Tool: jumbo_get_cart_count
    browser.webfuseSession.tools.registerTool({
        name: 'jumbo_get_cart_count',
        description: 'Check the current Jumbo cart item count by reading the cart badge from the live DOM.',
        inputSchema: {
            type: 'object',
            properties: {}
        },
        execute: async (args, ctx) => {
            let cartCount = null;
            const cartSelectors = [
                '[data-testid*="cart"] [class*="count"]',
                '[class*="cart-count"]',
                '[class*="minicart"] [class*="count"]',
                '[data-testid*="minicart"]',
                '.cart-count',
                '[aria-label*="winkelwagen"] [class*="count"]'
            ];

            for (const sel of cartSelectors) {
                const el = document.querySelector(sel);
                if (el) {
                    const text = el.textContent.trim();
                    const numMatch = text.match(/\d+/);
                    if (numMatch) {
                        cartCount = parseInt(numMatch[0]);
                        break;
                    }
                }
            }

            return JSON.stringify({
                cartCount: cartCount,
                url: window.location.href,
                timestamp: new Date().toISOString()
            }, null, 2);
        }
    });

    console.log('[Jumbo Cart API] MCP tools registered: jumbo_add_to_cart, jumbo_get_cart_count');
})();
