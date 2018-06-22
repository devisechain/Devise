# -*- coding: utf-8 -*-
"""
    devise.config
    ~~~~~~~~~~~~~~~~~~~~~~~~~
    This file contains static configuration values for the Devise python codebase

    :copyright: © 2018 Pit.AI
    :license: BSD, see LICENSE for more details.
"""

# A static mapping of blockchain ID to deployed contract addresses

CONTRACT_ADDRESSES = {
    # Main Ethereum network
    '1': {
        "DEVISE_RENTAL": "",
        "DEVISE_TOKEN": "",
        "DEVISE_TOKEN_SALE": ""
    },
    # Rinkeby test network
    '4': {
        "DEVISE_RENTAL": "0xA3A5387cD8177BA3f5F47696988b1B51A3331CBF",
        "DEVISE_TOKEN": "0xF60Ef7D51a4Beb501bFcB380E1abbF49C042Ec53",
        "DEVISE_TOKEN_SALE": "0x7e50014E03535a14F844DF56dB4847254754Bb7B"
    },
    # Ganache test tool
    '7778454': {
        'DEVISE_RENTAL': '0xca5c8dC7C604590214c835463B41bC2cbC6deEd5',
        'DEVISE_TOKEN': '0xD2AB5fA56D6d571De4d4B6531aD6F9147ddf058D',
        'DEVISE_TOKEN_SALE': '0x0987eE274279c6707535FaEE0e2135857f3c3291'
    },
    # dev1.devisechain.io
    "777666": {
        "DEVISE_RENTAL": "0x30Ca3a0917ABC23C3b38A9993d84a14e12cd71Cd",
        "DEVISE_TOKEN_SALE": "0xA76068c461716d34499cA221A037Cedb39067e26",
        "DEVISE_TOKEN": "0xC1844bbe0537cE51F95F9EC08c55D697fCcf3f17"
    }
}
