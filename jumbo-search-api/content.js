/**
 * Jumbo Search API - Content Script
 *
 * Registers MCP tools that use the Webfuse Automation API.
 * - jumbo_search: navigates to Jumbo search, waits for products, scans page
 * - jumbo_scan_page: scans the current page for products
 *
 * Both tools use browser.webfuseSession.automation.see.domSnapshot()
 * to read the page (including shadow DOM and iframes that raw JS can't reach),
 * then parse the HTML to extract product data.
 */

(function () {
    'use strict';

    const automation = browser.webfuseSession.automation;

    // ---- Product extraction from HTML ----

    function extractProductsFromHTML(html) {
        const products = [];
        const productLinkPattern = /href="(\/producten\/[^"]+-(\d+)([A-Z]{2,4}))"/g;
        const seen = new Set();
        let match;

        while ((match = productLinkPattern.exec(html)) !== null) {
            const href = match[1];
            const productId = match[2] + match[3];

            if (seen.has(productId)) continue;
            seen.add(productId);

            // Extract the product name from the link text
            // Look for the text content near the href
            const linkContext = html.substring(
                Math.max(0, match.index - 500),
                Math.min(html.length, match.index + 500)
            );

            // Try to find a heading or title near the link
            const nameMatch = linkContext.match(/>([^<]{5,200})<\/(?:a|h3|h4|span|p)>/);
            const name = nameMatch ? nameMatch[1].trim() : '';

            if (!name) continue;

            // Extract image
            const imgMatch = linkContext.match(/src="([^"]*\.(?:png|jpg|jpeg|webp)[^"]*)"/i);
            const image = imgMatch ? imgMatch[1] : '';

            // Check for sponsored
            const isSponsored = /gesponsord/i.test(linkContext);

            // Extract price
            let price = null;
            const priceMatch = linkContext.match(/€\s*(\d+[.,]\d{1,2})/);
            if (priceMatch) {
                price = parseFloat(priceMatch[1].replace(',', '.'));
            }

            // Extract pack size
            let packSize = '';
            const sizePatterns = [
                /\b(\d+\s*[xX]\s*\d+\s*[gGkK]{1,2})\b/,
                /\b(\d+\s*[gGkK]{1,2})\b/,
                /\b(\d+\s*[xX]\s*\d+\s*[mM][lL])\b/,
                /\b(\d+\s*[mM][lL])\b/
            ];
            for (const pattern of sizePatterns) {
                const sizeMatch = linkContext.match(pattern);
                if (sizeMatch) { packSize = sizeMatch[1]; break; }
            }

            const fullUrl = 'https://www.jumbo.com' + href;

            // Look for add-to-cart button in the context
            const btnMatch = linkContext.match(/<(?:button|a)[^>]*(?:class="[^"]*(?:is-primary|jum-button|success)[^"]*")[^>]*>/i);
            let addToCartSelector = null;
            if (btnMatch) {
                // Build a CSS selector from the found button
                const classMatch = btnMatch[0].match(/class="([^"]*)"/);
                if (classMatch) {
                    const classes = classMatch[1].trim().split(/\s+/);
                    if (classes.length > 0) {
                        addToCartSelector = 'button.' + classes.join('.');
                    }
                }
            }

            products.push({
                id: productId,
                name: name,
                url: fullUrl,
                image: image,
                price: price,
                packSize: packSize,
                sponsored: isSponsored,
                addToCartSelector: addToCartSelector
            });
        }

        return products;
    }

    // ---- Wait for products to appear ----

    function waitForProducts(maxWaitMs) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const checkInterval = setInterval(() => {
                const links = document.querySelectorAll('a[href*="/producten/"]');
                if (links.length > 0) {
                    clearInterval(checkInterval);
                    // Give extra time for all products to render
                    setTimeout(() => resolve(true), 2000);
                } else if (Date.now() - startTime > maxWaitMs) {
                    clearInterval(checkInterval);
                    resolve(false);
                }
            }, 500);
        });
    }

    // ---- Scroll page using Automation API ----

    async function scrollPage() {
        try {
            await automation.act.scroll({ target: 'body', amount: 800 });
            await new Promise(r => setTimeout(r, 1000));
            await automation.act.scroll({ target: 'body', amount: 800 });
            await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
            console.log('[Jumbo Search API] Scroll failed, continuing', e);
        }
    }

    // ---- Register MCP Tools ----

    // Tool: jumbo_search
    browser.webfuseSession.tools.registerTool({
        name: 'jumbo_search',
        description: 'Search for a product on Jumbo. Navigates to the Jumbo search page, waits for results, scrolls to load all products, takes a DOM snapshot using the Automation API, and returns a list of products with name, price, image, pack size, and add-to-cart button selector.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'The product to search for (e.g. banana, milk, mango)'
                }
            },
            required: ['query']
        },
        execute: async (args, ctx) => {
            const query = args.query;

            // Report progress
            browser.webfuseSession.tools.sendAutomationProgress(ctx.eventId, {
                progress: 1, total: 4, message: 'Navigating to Jumbo search: ' + query
            });

            // Navigate to Jumbo search using Automation API
            const searchUrl = 'https://www.jumbo.com/producten/?searchType=keyword&searchTerms=' + encodeURIComponent(query);
            await automation.navigate({ url: searchUrl });

            // Wait for products to load
            browser.webfuseSession.tools.sendAutomationProgress(ctx.eventId, {
                progress: 2, total: 4, message: 'Waiting for products to load...'
            });
            const found = await waitForProducts(15000);

            if (!found) {
                return { error: 'No products found for: ' + query };
            }

            // Scroll to load lazy products using Automation API
            browser.webfuseSession.tools.sendAutomationProgress(ctx.eventId, {
                progress: 3, total: 4, message: 'Scrolling to load all products...'
            });
            await scrollPage();

            // Take DOM snapshot using Automation API
            browser.webfuseSession.tools.sendAutomationProgress(ctx.eventId, {
                progress: 4, total: 4, message: 'Scanning page with Automation API...'
            });
            const snapshot = await automation.see.domSnapshot();

            // Extract products from the snapshot
            const products = extractProductsFromHTML(snapshot.html || snapshot || '');

            // Cache results
            browser.runtime.sendMessage({
                type: 'SEARCH_RESULTS',
                query: query,
                products: products,
                url: window.location.href
            }).catch(() => {});

            return JSON.stringify({
                query: query,
                count: products.length,
                url: window.location.href,
                products: products
            }, null, 2);
        }
    });

    // Tool: jumbo_scan_page
    browser.webfuseSession.tools.registerTool({
        name: 'jumbo_scan_page',
        description: 'Scan the current Jumbo page for products using the Webfuse Automation API DOM snapshot. Returns all products found with name, price, image, pack size, and add-to-cart button selector.',
        inputSchema: {
            type: 'object',
            properties: {}
        },
        execute: async (args, ctx) => {
            browser.webfuseSession.tools.sendAutomationProgress(ctx.eventId, {
                progress: 1, total: 2, message: 'Scrolling page to load products...'
            });
            await scrollPage();

            browser.webfuseSession.tools.sendAutomationProgress(ctx.eventId, {
                progress: 2, total: 2, message: 'Taking DOM snapshot with Automation API...'
            });
            const snapshot = await automation.see.domSnapshot();
            const products = extractProductsFromHTML(snapshot.html || snapshot || '');

            return JSON.stringify({
                count: products.length,
                url: window.location.href,
                title: document.title,
                products: products
            }, null, 2);
        }
    });

    console.log('[Jumbo Search API] MCP tools registered: jumbo_search, jumbo_scan_page');
})();
