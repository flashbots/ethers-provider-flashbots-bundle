# ethers-provider-flashbots-bundle

Contains the `FlashbotsBundleProvider` ethers.js provider to provide high-level access to `eth_sendBundle` and `eth_callBundle` rpc endpoint on [mev-relay](https://github.com/flashbots/mev-relay-js).

Flashbots-enabled relays and miners expose two new jsonrpc endpoint: `eth_sendBundle` and `eth_callBundle`. Since these are brand-new, non-standard endpoints, ethers.js and other libraries do not natively support these requests (like `getTransactionCount`). In order to interact with these endpoints, you will also need access to another full-featured (non-Flashbots) endpoint for nonce-calculation, gas estimation, and transaction status.

Flashbots also requires signed payloads. This library takes care of the signing process via the `authSigner` passed into the constructor. [Read more about relay signatures here](https://github.com/flashbots/mev-relay-js#authentication)


This library is not a fully functional ethers.js implementation, just a simple provider class, designed to interact with your existing ethers.js v5 module.

You must pass in a generic ethers.js provider to the Flashbots provider in the constructor:

```ts
const NETWORK_INFO = { chainId: 1, ensAddress: '', name: 'mainnet' }
// Standard json rpc provider directly from ethers.js
const provider = new providers.JsonRpcProvider({ url: ETHEREUM_RPC_URL }, NETWORK_INFO)
// `authSigner` is an Ethereum private key that does NOT store funds and is NOT your bot's primary key.
// This is an identifying key for signing payloads to establish reputation and whitelisting
const authSigner = new Wallet('0x0000000000000000000000000000000000000000000000000000000000000000')
// flashbots provider requires passing in a standard provider
const flashbotsProvider = await FlashbotsBundleProvider.create(provider, authSigner)
```

The flashbotsProvider provides the sendBundle function:

```ts
flashbotsProvider.sendBundle(bundledTransactions: Array<FlashbotsBundleTransaction | FlashbotsBundleRawTransaction>, targetBlockNumber: number)
    => Promise<FlashbotsTransactionResponse | RelayResponseError>
```

and simulate function:

```ts
flashbotsProvider.simulate(
    signedBundledTransactions: Array<string>,
    blockTag: BlockTag,
    stateBlockTag?: BlockTag,
    blockTimestamp?: number)
      => Promise<SimulationResponse>
```

## Example

```ts
// Using the map below ships two different bundles, targeting the next two blocks
const blockNumber = await provider.getBlockNumber()
const minTimestamp = (await provider.getBlock(blockNumber)).timestamp
const maxTimestamp = minTimestamp + 120
const bundlePromises = [blockNumber + 1, blockNumber + 2].map((targetBlockNumber) =>
  flashbotsProvider.sendBundle(
    [
      {
        signedTransaction: SIGNED_ORACLE_UPDATE_FROM_PENDING_POOL // serialized signed transaction hex
      },
      {
        signer: wallet, // ethers signer
        transaction: transaction // ethers populated transaction object
      }
    ],
    targetBlockNumber, // block number at which this bundle is valid
    {
      minTimestamp, // optional minimum timestamp at which this bundle is valid (inclusive)
      maxTimestamp, // optional maximum timestamp at which this bundle is valid (inclusive)
      revertingTxHashes: [tx1, tx2] // optional list of transaction hashes allowed to revert. Without specifying here, any revert invalidates the entire bundle.
    }
  )
)
```

## bundledTransactions

A Flashbots bundle consists of one or more transactions in strict order to be relayed to the miner directly. While the miner requires signed transactions, `sendBundle()` can receive a mix of pre-signed transaction and `TransactionRequest` + `Signer` (wallet) objects.

These bundles can pay the miner either via gas fees _OR_ via `block.coinbase.transfer(minerReward)`.

## targetBlockNumber

The only block number for which the bundle is to be considered valid. If you would like more than one block to be targeted, submit multiple rpc calls targeting each specific block. This value should be higher than the value of getBlockNumber(). Submitting a bundle with a target block number of the current block, or earlier, is a no-op.

## Optional eth_sendBundle arguments

### minTimestamp / maxTimestamp

While each bundle targets only a single block, you can add an additional filter for validity based on the block's timestamp. This does *not* allow for targeting any block number based on a timestamp or instruct miners on what timestamp to use, it merely serves as a secondary filter. 

If your bundle is not valid before a certain time or includes an expiring opportunity, setting these values allows the miner to skip bundle processing earlier in the phase.

Additionally, you could target several blocks in the future, but with a strict maxTimestamp, to ensure your bundle is considered for inclusion up to a specific time, regardless of how quickly blocks are mined in that timeframe.

### Reverting Transaction Hashes

Transaction bundles will not be considered for inclusion if they include *any* transactions in them that revert or fail. While this is normally desirable, there are some advanced use-cases where a searcher might WANT to bring a failing transaction to the chain. This is normally desirable for nonce management. Consider:

Transaction Nonce #1 = Failed (unrelated) token transfer
Transaction Nonce #2 = DEX trade

If a searcher wants to bring #2 to the chain, #1 must be included first, and its failure is not related to the desired transaction #2. This is especially common during high gas times.

Optional parameter `revertingTxHashes` allows a searcher to specify an array of transactions that can (but are not required to) revert.

## FlashbotsTransactionResponse

A high-level object which contains metadata available at transaction submission time, as well as the following functions which can wait, track, and simulate the bundle's behavior.

- bundleTransactions() - An array of transaction descriptions sent to the relay, including hash, nonce, and the raw transaction.
- receipts() - Returns promise of an array of transaction receipts corresponding to the transaction hashes that were relayed as part of the bundle. Will not wait for block to be mined; could return incomplete information
- wait() - Returns a promise which will wait for target block number to be reached _OR_ one of the transactions to become invalid due to nonce-issues (including, but not limited to, one of the transactions from your bundle being included too early). Returns the wait resolution as a status enum
- simulate() - Returns a promise of the transaction simulation, once the proper block height has been reached. Use this function to troubleshoot failing bundles and verify miner profitability

## How to run demo.ts

Included is a simple demo of how to construct the FlashbotsProvider with auth signer authentication and submit a [non-functional] bundle. This will not yield any mev, but serves as a sample initialization to help integrate into your own functional searcher.
