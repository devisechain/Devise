async function assertRevert(promise) {
    try {
        await promise;
        console.assert(false, 'Expected revert not received');
    } catch (error) {
        const revertFound = error.message.search(': revert') >= 0;
        console.assert(revertFound, `Expected "revert", got ${error} instead`);
    }
}

module.exports = assertRevert;