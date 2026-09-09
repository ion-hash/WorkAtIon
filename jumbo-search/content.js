/**
 * Jumbo Product Search - Content Script
 *
 * Runs inside every Jumbo page. Extracts product data from the DOM.
 * Handles search navigation requests.
 */

(function () {
    'use strict';

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

            const card = link.closest('article, li, div[class*="product"], section');
            const cardEl = card || link.parentElement;

            let image = '';
            const imgEl = cardEl ? cardEl.querySelector('img') : null;
            if (imgEl) {
                image = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '';
            }

            const cardText = cardEl ? cardEl.textContent : '';
            const isSponsored = /gesponsord/i.test(cardText);

            let price = null;
            const priceRegex = /\u20ac\s*(\d+[.,]\d{1,2})/;
            if (cardText) {
                const priceMatch = cardText.match(priceRegex);
                if (priceMatch) { price = parseFloat(priceMatch[1].replace(',', '.')); }
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
                if (btn) { addToCartSelector = generateSelector(btn); }
            }

            products.push({
                id: productId,
                name: name,
                url: fullUrl,
                image: image,
                price: price,
                packSize: packSize,
                sponsored: isSponsored,
                addToCartSelector: addToCartSelector,
                extractedAt: new Date().toISOString()
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
                if (classes.length > 0) { selector += '.' + classes.join('.'); }
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

    function autoScroll(callback) {
        let totalHeight = 0;
        const distance = 400;
        const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;
            if (totalHeight >= scrollHeight) {
                clearInterval(timer);
                setTimeout(callback, 500);
            }
        }, 200);
    }

    browser.runtime.onMessage.addListener((message, sender) => {
        if (message.type === 'EXTRACT_PRODUCTS') {
            const scrollFirst = message.autoScroll !== false;
            if (scrollFirst) {
                return new Promise((resolve) => {
                    autoScroll(() => {
                        const products = extractProducts();
                        resolve({ count: products.length, products: products, url: window.location.href, title: document.title });
                    });
                });
            } else {
                const products = extractProducts();
                return Promise.resolve({ count: products.length, products: products, url: window.location.href, title: document.title });
            }
        }

        if (message.type === 'SEARCH_PRODUCT') {
            const searchTerm = encodeURIComponent(message.query);
            window.location.href = 'https://www.jumbo.com/producten/?searchType=keyword&searchTerms=' + searchTerm;
            return Promise.resolve({ navigating: true });
        }
    });

    function autoExtract() {
        const isProductPage = window.location.href.includes('/producten/');
        if (!isProductPage) return;

        const checkProducts = setInterval(() => {
            const links = document.querySelectorAll('a[href^="/producten/"]');
            if (links.length > 0) {
                clearInterval(checkProducts);
                setTimeout(() => {
                    const products = extractProducts();
                    browser.runtime.sendMessage({
                        type: 'PRODUCTS_FOUND',
                        count: products.length,
                        products: products,
                        url: window.location.href,
                        title: document.title
                    }).catch(() => {});
                }, 1000);
            }
        }, 500);

        setTimeout(() => clearInterval(checkProducts), 10000);
    }

    autoExtract();
})();
