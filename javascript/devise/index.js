import DeviseClient from './clients/client';

if (typeof XMLHttpRequest === 'undefined') {
    global.XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest;
}

export {DeviseClient};
