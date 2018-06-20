# -*- coding: utf-8 -*-
"""
Test utilities to interact with ganache/testrpc
"""
# Ganache test private keys
TEST_KEYS = [
    '8d377499433184695c672b3b970dc1e2ef50ae5ff50052773d7dffa194388b36',
    '52c006688764c10edc04880a7cba1a1a51cfe2baff22469ee8f8d89d5c49a953',
    '4d3ed2d4d476ad5a9f4c780daea028dd83f01bfba3e33484150c7341ba448d41',
    '2e3a5c9de39b817f5f51a1efd5a9d8272cfc11f9a5c1f7fd657b8a7ae28e3643',
    'e2e9e2b711f219066121699ad7e166e1a62073c59f3f4dcae512f8877408d1c3',
    'c5b7e45ba600324868a0c86a567b902dc35f0958ca46fb86dcaf352f12e6d913'
]


def time_travel(seconds, client):
    """Moves time forward on the test blockchain"""
    client.w3.manager.request_blocking('evm_increaseTime', [seconds])
    client.w3.manager.request_blocking('evm_mine', [])


def evm_snapshot(client):
    """Takes a snapshot of the current state of the blockchain"""
    return client.w3.manager.request_blocking('evm_snapshot', [])


def evm_revert(snapshot_id, client):
    """Reverts the test blockchain to a saved snapshot"""
    return client.w3.manager.request_blocking('evm_revert', [snapshot_id])
