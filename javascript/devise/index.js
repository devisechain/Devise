/*!
 * devise
 * Copyright(c) 2018 Pit.AI Technologies
 * LICENSE: GNU GENERAL PUBLIC LICENSE Version 3, 29 June 2007
 *
 *  ES5 Example Usage:
 *      var client = new devise.DeviseClient(account);
 *      client.init_contracts().then(() => {
 *        client.client_summary().then(summary => console.log(summary));
 *      });

 *  Async/Await Example Usage:
 *      const client = new devise.DeviseClient(account);
 *      await client.init_contracts();
 *      const client_summary = await client.client_summary();
 *      console.log(client_summary);
 */

import DeviseClient from './clients/client';
import DeviseTokenOwner from './owner/token_owner';
import MasterNode from './miners/master_node';
import DeviseOwner from './owner/owner';

/**
 * Polyfill for environments without XHR
 */
if (typeof XMLHttpRequest === 'undefined') {
    global.XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest;
}

export {DeviseClient, DeviseTokenOwner, MasterNode, DeviseOwner};
