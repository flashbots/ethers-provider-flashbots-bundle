ethers-provider-flashbots-bundle
================================

Contains the `FlashbotsBundleProvider` ethers.js provider to provide high-level access to eth_sendBundle rpc

Flashbots-enabled relays and miners will expose a single jsonrpc endpoint:  `eth_sendBundle`. Since this is both a brand new endpoint and the jsonrpc offered by these services will NOT service other rpc requests (like `getTransactionCount`), you will need to combine this rpc endpoint with another full-featured endpoint that supports nonce-calculation, estimation, and transaction status.

You can pass in a generic ethers.js provider to the flashbots provider in the constructor:

```
const NETWORK_INFO = {chainId: 1, ensAddress: '', name: 'mainnet'}

const provider = new providers.JsonRpcProvider({url: ETHEREUM_URL}, NETWORK_INFO)

const flashbotsProvider = new FlashbotsBundleProvider(provider, {url: FLASHBOTS_RELAY_URL}, NETWORK_INFO)
``` 

The flashbotsProvider provides the sendBundle function:

```
flashbotsProvider.sendBundle(bundledTransactions: Array<FlashbotsBundleTransaction | FlashbotsBundleRawTransaction>, targetBlockNumber: number)
    => Promise<FlashbotsTransactionResponse>
```


bundledTransactions
-------------------
A flashbots bundle consists of one or more transactions in strict order to be relayed to the miner directly. While the miner requires signed transaction, of course, `sendBundle()` can receive a mix of pre-signed transaction and `Wallet` + `TransactionRequest`

...

targetBlockNumber
-------------------
The only block number for which the bundle is to be considered valid. If you would like more than one block to be targetted, submit multiple rpc calls targeting each block.

...

FlashbotsTransactionResponse
----------------------------
A high-level object which contains metadata available at transaction submission time, as well as the following functions which can wait, track, and simulate the bundle's behavior

...
