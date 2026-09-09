/**
 * Jumbo Search API - Content Script
 *
 * Registers MCP tools:
 * - jumbo_search: navigates to Jumbo search page and waits for products (fast, under 15s)
 * - jumbo_scan_page: scans current page for products using document.querySelectorAll
 *
 * Product extraction uses the live DOM (document.querySelectorAll) which reliably
 * finds product links in Jumbo's Nuxt.js SPA. The Automation API is used for
 * navigation and scrolling.
 */

(function () {
    'use strict';

    const automation = browser.webfuseSession.automation;

    // ---- Product extraction from live DOM ----

    function extractProducts() {
        const products = [];
        const productLinkPattern = /^\/producten\/.+-(\d+)([A-Z]{2,4})$/;
        const productLinks = document.querySelectorAll('a[href^="/producten/"]');
        const seen = new Set();

        productLinks.forEach((link) => {
            const href = link.getAttribute('href') || '';
            const match = href.match(productLinkPattern);
            if (!match) return;

            const productId = match[1] + match[2];
            if (seen.has(productId)) return;
            seen.add(productId);

            const name = link.textContent.trim() || link.getAttribute('title') || '';
            if (!name) return;

            const card = link.closest('article, li, div[class*="product"], section, [data-testid*="product"]');
            const cardEl = card || link.parentElement;

            let image = '';
            const imgEl = cardEl ? cardEl.querySelector('img') : null;
            if (imgEl) {
                image = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '';
            }

            const cardText = cardEl ? cardEl.textContent : '';
            const isSponsored = /gesponsord/i.test(cardText);

            let price = null;
            const priceMatch = cardText.match(/\u20ac\s*(\d+[.,]\d{1,2})/);
            if (priceMatch) {
                price = parseFloat(priceMatch[1].replace(',', '.'));
            }

            let packSize = '';
            const sizePatterns = [
                /\b(\d+\s*[xX]\s*\d+\s*[gGkK]{1,2})\b/,
                /\b(\d+\s*[gGkK]{1,2})\b/,
                /\b(\d+\s*[xX]\s*\d+\s*[mM][lL])\b/,
                /\b(\d+\s*[mM][lL])\b/,
                /\b(\d+\s*[xX]\s*\d+\s*[sS][tT][uU][kK]?)\b/,
                /\b(\d+\s*[sS][tT][uU][kK]?)\b/
            ];
            for (const pattern of sizePatterns) {
                const sizeMatch = cardText.match(pattern);
                if (sizeMatch) { packSize = sizeMatch[1]; break; }
            }

            const fullUrl = 'https://www.jumbo.com' + href;

            let addToCartSelector = null;
            if (cardEl) {
                const btn = cardEl.querySelector('button.is-primary, button.success, button[class*="jum-button"]');
                if (btn) {
                    addToCartSelector = generateSelector(btn);
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
        });

        return products;
    }

    function generateSelector(el) {
        if (el.id) return '#' + el.id;
        const path = [];
        let current = el;
        while (current && current !== document.body) {
            let selector = current.tagName.toLowerCase();
            if (current.className) {
                const classes = current.className.split(/\s+/).filter(c => c.length > 0);
                if (classes.length > 0) {
                    selector += '.' + classes.join('.');
                }
            }
            const parent = current.parentElement;
            if (parent) {
                const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
                if (siblings.length > 1) {
                    const index = siblings.indexOf(current);
                    selector += ':nth-of-type(' + (index + 1) + ')';
                }
            }
            path.unshift(selector);
            current = parent;
        }
        return path.join(' > ');
    }

    // ---- Wait for products to appear in DOM ----

    function waitForProducts(maxWaitMs) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const checkInterval = setInterval(() => {
                const links = document.querySelectorAll('a[href^="/producten/"]');
                if (links.length > 0) {
                    clearInterval(checkInterval);
                    setTimeout(() => resolve(true), 1500);
                } else if (Date.now() - startTime > maxWaitMs) {
                    clearInterval(checkInterval);
                    resolve(false);
                }
            }, 500);
        });
    }

    // ---- Scroll page ----

    async function scrollPage() {
        try {
            await automation.act.scroll({ target: 'body', amount: 600 });
            await new Promise(r => setTimeout(r, 800));
            await automation.act.scroll({ target: 'body', amount: 600 });
            await new Promise(r => setTimeout(r, 800));
        } catch (e) {
            // Fallback to native scroll
            window.scrollBy(0, 600);
            await new Promise(r => setTimeout(r, 800));
            window.scrollBy(0, 600);
            await new Promise(r => setTimeout(r, 800));
        }
    }

    // ---- Register MCP Tools ----

    // Tool: jumbo_search - navigates and waits for products (fast, under 15s)
    browser.webfuseSession.tools.registerTool({
        name: 'jumbo_search',
        description: 'Search for a product on Jumbo. Navigates to the Jumbo search page and waits for products to load. Returns the search URL and number of products found. Use jumbo_scan_page afterwards to get the full product list with details.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description': 'The product to search for (e.g. banana, milk, mango)'
                }
            },
            required: ['query']
        },
        execute: async (args, ctx) => {
            const query = args.query;

            browser.webfuseSession.tools.sendAutomationProgress(ctx.eventId, {
                progress: 1, total: 2, message: 'Navigating to Jumbo search: ' + query
            });

            // Navigate using Automation API
            const searchUrl = 'https://www.jumbo.com/producten/?searchType=keyword&searchTerms=' + encodeURIComponent(query);
            await automation.navigate({ url: searchUrl });

            browser.webfuseSession.tools.sendAutomationProgress(ctx.eventId, {
                progress: 2, total: 2, message: 'Waiting for products to load...'
            });

            // Wait for products to appear in DOM
            const found = await waitForProducts(10000);

            return JSON.stringify({
                query: query,
                url: window.location.href,
                productsFound: found,
                productCount: found ? document.querySelectorAll('a[href^="/producten/"]').length : 0,
                message: found ? 'Products loaded. Call jumbo_scan_page to get full product list.' : 'No products found.'
            }, null, 2);
        }
    });

    // Tool: jumbo_scan_page - scans current page for products (fast, under 15s)
    browser.webfuseSession.tools.registerTool({
        name: 'jumbo_scan_page',
        description: 'Scan the current Jumbo page for products. Scrolls to load all products then extracts name, price, image, pack size, and add-to-cart button selector using the live DOM. Call after jumbo_search.',
        inputSchema: {
            type: 'object',
            properties: {}
        },
        execute: async (args, ctx) => {
            browser.webfuseSession.tools.sendAutomationProgress(ctx.eventId, {
                progress: 1, total: 2, message: 'Scrolling to load products...'
            });
            await scrollPage();

            browser.webfuseSession.tools.sendAutomationProgress(ctx.eventId, {
                progress: 2, total: 2, message: 'Extracting products from DOM...'
            });

            const products = extractProducts();

            // Cache results
            browser.runtime.sendMessage({
                type: 'SEARCH_RESULTS',
                query: new URLSearchParams(window.location.search).get('searchTerms') || 'unknown',
                products: products,
                url: window.location.href
            }).catch(() => {});

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
