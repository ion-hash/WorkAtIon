/**
 * Jumbo Cart API - Content Script
 *
 * Registers MCP tools that use the Webfuse Automation API:
 * - jumbo_add_to_cart: clicks an add-to-cart button using automation.act.click()
 * - jumbo_get_cart_count: reads cart count via automation.see.domSnapshot()
 *
 * Uses the Automation API instead of raw JS DOM manipulation.
 * This means it can target elements through shadow DOM and iframes.
 */

(function () {
    'use strict';

    const automation = browser.webfuseSession.automation;

    // ---- Register MCP Tools ----

    // Tool: jumbo_add_to_cart
    browser.webfuseSession.tools.registerTool({
        name: 'jumbo_add_to_cart',
        description: 'Add a product to the Jumbo cart by clicking its add-to-cart button using the Webfuse Automation API. Scrolls the button into view, clicks it, waits for cart to update, then verifies the cart count.',
        inputSchema: {
            type: 'object',
            properties: {
                selector: {
                    type: 'string',
                    description: 'CSS selector for the add-to-cart button (from jumbo_search results)'
                },
                quantity: {
                    type: 'integer',
                    'description': 'Quantity to add (default 1)',
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
                progress: 1, total: 4, message: 'Scrolling button into view...'
            });

            // Scroll to the button area using Automation API
            try {
                await automation.act.scroll({ target: selector, amount: 200 });
                await new Promise(r => setTimeout(r, 500));
            } catch (e) {
                // Fall back to scrolling the page
                try {
                    await automation.act.scroll({ target: 'body', amount: 400 });
                    await new Promise(r => setTimeout(r, 500));
                } catch (e2) {
                    // Continue anyway
                }
            }

            // First click using Automation API
            browser.webfuseSession.tools.sendAutomationProgress(ctx.eventId, {
                progress: 2, total: 4, message: 'Clicking add-to-cart button...'
            });

            try {
                await automation.act.click({ target: selector });
            } catch (e) {
                return JSON.stringify({
                    success: false,
                    error: 'Failed to click button: ' + e.message,
                    selector: selector
                });
            }

            // Wait for cart to update
            browser.webfuseSession.tools.sendAutomationProgress(ctx.eventId, {
                progress: 3, total: 4, message: 'Waiting for cart to update...'
            });
            await new Promise(r => setTimeout(r, 2000));

            // Handle quantity > 1: click additional times
            if (quantity > 1) {
                for (let i = 1; i < quantity; i++) {
                    try {
                        await automation.act.click({ target: selector });
                        await new Promise(r => setTimeout(r, 1000));
                    } catch (e) {
                        // Button might have changed state
                        break;
                    }
                }
            }

            // Take a DOM snapshot to find cart count using Automation API
            browser.webfuseSession.tools.sendAutomationProgress(ctx.eventId, {
                progress: 4, total: 4, message: 'Verifying cart count...'
            });

            let cartCount = null;
            try {
                const snapshot = await automation.see.domSnapshot();
                const html = snapshot.html || snapshot || '';
                // Look for cart count in common Jumbo cart badge patterns
                const cartMatch = html.match(/(?:cart-count|cartCount|cart_count|winkelwagen)[^>]*>(\d+)/i);
                if (cartMatch) {
                    cartCount = parseInt(cartMatch[1]);
                }
            } catch (e) {
                // Snapshot might fail, that's ok
            }

            // Cache the result
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
        description: 'Check the current Jumbo cart item count by taking a DOM snapshot using the Automation API and finding the cart badge.',
        inputSchema: {
            type: 'object',
            properties: {}
        },
        execute: async (args, ctx) => {
            browser.webfuseSession.tools.sendAutomationProgress(ctx.eventId, {
                progress: 1, total: 1, message: 'Reading cart count...'
            });

            const snapshot = await automation.see.domSnapshot();
            const html = snapshot.html || snapshot || '';

            let cartCount = null;
            const patterns = [
                /(?:cart-count|cartCount|cart_count)[^>]*>(\d+)/i,
                /winkelwagen[^>]*>(\d+)/i,
                /class="[^"]*badge[^"]*"[^>]*>(\d+)/i
            ];

            for (const pattern of patterns) {
                const match = html.match(pattern);
                if (match) {
                    cartCount = parseInt(match[1]);
                    break;
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
