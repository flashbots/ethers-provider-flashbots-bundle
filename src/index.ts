import { BlockTag, TransactionReceipt, TransactionRequest } from '@ethersproject/abstract-provider'
import { Networkish } from '@ethersproject/networks'
import { BaseProvider, TransactionResponse } from '@ethersproject/providers'
import { ConnectionInfo, fetchJson } from '@ethersproject/web'
import { BigNumber, ethers, providers, Signer } from 'ethers'
import { id } from 'ethers/lib/utils'
import { encode } from '@ethersproject/rlp'
import { encrypt } from 'eciesjs'

export const DEFAULT_FLASHBOTS_RELAY = 'https://relay.flashbots.net'

export enum FlashbotsBundleResolution {
  BundleIncluded,
  BlockPassedWithoutInclusion,
  AccountNonceTooHigh
}

export interface FlashbotsBundleRawTransaction {
  signedTransaction: string
}

export interface FlashbotsBundleTransaction {
  transaction: TransactionRequest
  signer: Signer
}

export interface FlashbotsOptions {
  minTimestamp?: number
  maxTimestamp?: number
  revertingTxHashes?: Array<string>
}

export interface FlashbotsBundle {
  signedBundledTransactions: Array<string>
  blockTarget: number
  options?: FlashbotsOptions
}

export interface TransactionAccountNonce {
  hash: string
  signedTransaction: string
  account: string
  nonce: number
}

export interface FlashbotsTransactionResponse {
  bundleTransactions: Array<TransactionAccountNonce>
  wait: () => Promise<FlashbotsBundleResolution>
  simulate: () => Promise<SimulationResponse>
  receipts: () => Promise<Array<TransactionReceipt>>
}

export interface TransactionSimulationBase {
  txHash: string
  gasUsed: number
}

export interface TransactionSimulationSuccess extends TransactionSimulationBase {
  value: string
}

export interface TransactionSimulationRevert extends TransactionSimulationBase {
  error: string
  revert: string
}

export type TransactionSimulation = TransactionSimulationSuccess | TransactionSimulationRevert

export interface RelayResponseError {
  error: {
    message: string
    code: number
  }
}

export interface SimulationResponseSuccess {
  bundleHash: string
  coinbaseDiff: BigNumber
  results: Array<TransactionSimulation>
  totalGasUsed: number
  firstRevert?: TransactionSimulation
}

export type SimulationResponse = SimulationResponseSuccess | RelayResponseError

export type FlashbotsTransaction = FlashbotsTransactionResponse | RelayResponseError

export interface GetUserStatsResponseSuccess {
  signing_address: string
  blocks_won_total: number
  bundles_submitted_total: number
  bundles_error_total: number
  avg_gas_price_gwei: number
  blocks_won_last_7d: number
  bundles_submitted_last_7d: number
  bundles_error_7d: number
  avg_gas_price_gwei_last_7d: number
  blocks_won_last_numberd: number
  bundles_submitted_last_numberd: number
  bundles_error_numberd: number
  avg_gas_price_gwei_last_numberd: number
  blocks_won_last_numberh: number
  bundles_submitted_last_numberh: number
  bundles_error_numberh: number
  avg_gas_price_gwei_last_numberh: number
  blocks_won_last_5m: number
  bundles_submitted_last_5m: number
  bundles_error_5m: number
  avg_gas_price_gwei_last_5m: number
}

export type GetUserStatsResponse = GetUserStatsResponseSuccess | RelayResponseError

export interface GetBundleStatsResponseSuccess {
  isSimulated: boolean
  isSentToMiners: boolean
  isHighPriority: boolean
  simulatedAt: string
  submittedAt: string
  sentToMinersAt: string
}

export type GetBundleStatsResponse = GetBundleStatsResponseSuccess | RelayResponseError

type RpcParams = Array<string[] | string | number | Record<string, unknown>>

const TIMEOUT_MS = 5 * 60 * 1000

export class FlashbotsBundleProvider extends providers.JsonRpcProvider {
  private genericProvider: BaseProvider
  private authSigner: Signer
  private connectionInfo: ConnectionInfo

  constructor(genericProvider: BaseProvider, authSigner: Signer, connectionInfoOrUrl: ConnectionInfo, network: Networkish) {
    super(connectionInfoOrUrl, network)
    this.genericProvider = genericProvider
    this.authSigner = authSigner
    this.connectionInfo = connectionInfoOrUrl
  }

  static async throttleCallback(): Promise<boolean> {
    console.warn('Rate limited')
    return false
  }

  static async create(
    genericProvider: BaseProvider,
    authSigner: Signer,
    connectionInfoOrUrl?: ConnectionInfo | string,
    network?: Networkish
  ): Promise<FlashbotsBundleProvider> {
    const connectionInfo: ConnectionInfo =
      typeof connectionInfoOrUrl === 'string' || typeof connectionInfoOrUrl === 'undefined'
        ? {
            url: connectionInfoOrUrl || DEFAULT_FLASHBOTS_RELAY
          }
        : {
            ...connectionInfoOrUrl
          }
    if (connectionInfo.headers === undefined) connectionInfo.headers = {}
    connectionInfo.throttleCallback = FlashbotsBundleProvider.throttleCallback
    const networkish: Networkish = {
      chainId: 0,
      name: ''
    }
    if (typeof network === 'string') {
      networkish.name = network
    } else if (typeof network === 'number') {
      networkish.chainId = network
    } else if (typeof network === 'object') {
      networkish.name = network.name
      networkish.chainId = network.chainId
    }

    if (networkish.chainId === 0) {
      networkish.chainId = (await genericProvider.getNetwork()).chainId
    }

    return new FlashbotsBundleProvider(genericProvider, authSigner, connectionInfo, networkish)
  }

  static getMaxBaseFeeInFutureBlock(baseFee: BigNumber, blocksInFuture: number): BigNumber {
    let maxBaseFee = BigNumber.from(baseFee)
    for (let i = 0; i < blocksInFuture; i++) {
      maxBaseFee = maxBaseFee.mul(1125).div(1000).add(1)
    }
    return maxBaseFee
  }

  public async sendRawBundle(
    signedBundledTransactions: Array<string>,
    targetBlockNumber: number,
    opts?: FlashbotsOptions
  ): Promise<FlashbotsTransaction> {
    const params = {
      txs: signedBundledTransactions,
      blockNumber: `0x${targetBlockNumber.toString(16)}`,
      minTimestamp: opts?.minTimestamp,
      maxTimestamp: opts?.maxTimestamp,
      revertingTxHashes: opts?.revertingTxHashes
    }

    const request = JSON.stringify(this.prepareBundleRequest('eth_sendBundle', [params]))
    const response = await this.request(request)
    if (response.error !== undefined && response.error !== null) {
      return {
        error: {
          message: response.error.message,
          code: response.error.code
        }
      }
    }

    const bundleTransactions = signedBundledTransactions.map((signedTransaction) => {
      const transactionDetails = ethers.utils.parseTransaction(signedTransaction)
      return {
        signedTransaction,
        hash: ethers.utils.keccak256(signedTransaction),
        account: transactionDetails.from || '0x0',
        nonce: transactionDetails.nonce
      }
    })

    return {
      bundleTransactions,
      wait: () => this.wait(bundleTransactions, targetBlockNumber, TIMEOUT_MS),
      simulate: () =>
        this.simulate(
          bundleTransactions.map((tx) => tx.signedTransaction),
          targetBlockNumber,
          undefined,
          opts?.minTimestamp
        ),
      receipts: () => this.fetchReceipts(bundleTransactions)
    }
  }

  public async sendBundle(
    bundledTransactions: Array<FlashbotsBundleTransaction | FlashbotsBundleRawTransaction>,
    targetBlockNumber: number,
    opts?: FlashbotsOptions
  ): Promise<FlashbotsTransaction> {
    const signedTransactions = await this.signBundle(bundledTransactions)
    return this.sendRawBundle(signedTransactions, targetBlockNumber, opts)
  }

  public async signBundle(bundledTransactions: Array<FlashbotsBundleTransaction | FlashbotsBundleRawTransaction>): Promise<Array<string>> {
    const nonces: { [address: string]: BigNumber } = {}
    const signedTransactions = new Array<string>()
    for (const tx of bundledTransactions) {
      if ('signedTransaction' in tx) {
        // in case someone is mixing pre-signed and signing transactions, decode to add to nonce object
        const transactionDetails = ethers.utils.parseTransaction(tx.signedTransaction)
        if (transactionDetails.from === undefined) throw new Error('Could not decode signed transaction')
        nonces[transactionDetails.from] = BigNumber.from(transactionDetails.nonce + 1)
        signedTransactions.push(tx.signedTransaction)
        continue
      }
      const transaction = { ...tx.transaction }
      const address = await tx.signer.getAddress()
      if (typeof transaction.nonce === 'string') throw new Error('Bad nonce')
      const nonce =
        transaction.nonce !== undefined
          ? BigNumber.from(transaction.nonce)
          : nonces[address] || BigNumber.from(await this.genericProvider.getTransactionCount(address, 'latest'))
      nonces[address] = nonce.add(1)
      if (transaction.nonce === undefined) transaction.nonce = nonce
      if ((transaction.type == null || transaction.type == 0) && transaction.gasPrice === undefined)
        transaction.gasPrice = BigNumber.from(0)
      if (transaction.gasLimit === undefined) transaction.gasLimit = await tx.signer.estimateGas(transaction) // TODO: Add target block number and timestamp when supported by geth
      signedTransactions.push(await tx.signer.signTransaction(transaction))
    }
    return signedTransactions
  }

  private wait(transactionAccountNonces: Array<TransactionAccountNonce>, targetBlockNumber: number, timeout: number) {
    return new Promise<FlashbotsBundleResolution>((resolve, reject) => {
      let timer: NodeJS.Timer | null = null
      let done = false

      const minimumNonceByAccount = transactionAccountNonces.reduce((acc, accountNonce) => {
        if (accountNonce.nonce > 0 && (accountNonce.nonce || 0) < acc[accountNonce.account]) {
          acc[accountNonce.account] = accountNonce.nonce
        }
        acc[accountNonce.account] = accountNonce.nonce
        return acc
      }, {} as { [account: string]: number })
      const handler = async (blockNumber: number) => {
        if (blockNumber < targetBlockNumber) {
          const noncesValid = await Promise.all(
            Object.entries(minimumNonceByAccount).map(async ([account, nonce]) => {
              const transactionCount = await this.genericProvider.getTransactionCount(account)
              return nonce >= transactionCount
            })
          )
          const allNoncesValid = noncesValid.every(Boolean)
          if (allNoncesValid) return
          // target block not yet reached, but nonce has become invalid
          resolve(FlashbotsBundleResolution.AccountNonceTooHigh)
        } else {
          const block = await this.genericProvider.getBlock(targetBlockNumber)
          // check bundle against block:
          const blockTransactionsHash: { [key: string]: boolean } = {}
          for (const bt of block.transactions) {
            blockTransactionsHash[bt] = true
          }
          const bundleIncluded = transactionAccountNonces.every((transaction) => blockTransactionsHash[transaction.hash])
          resolve(bundleIncluded ? FlashbotsBundleResolution.BundleIncluded : FlashbotsBundleResolution.BlockPassedWithoutInclusion)
        }

        if (timer) {
          clearTimeout(timer)
        }
        if (done) {
          return
        }
        done = true

        this.genericProvider.removeListener('block', handler)
      }
      this.genericProvider.on('block', handler)

      if (typeof timeout === 'number' && timeout > 0) {
        timer = setTimeout(() => {
          if (done) {
            return
          }
          timer = null
          done = true

          this.genericProvider.removeListener('block', handler)
          reject('Timed out')
        }, timeout)
        if (timer.unref) {
          timer.unref()
        }
      }
    })
  }

  public async getUserStats(): Promise<GetUserStatsResponse> {
    const blockDetails = await this.genericProvider.getBlock('latest')
    const evmBlockNumber = `0x${blockDetails.number.toString(16)}`

    const params = [evmBlockNumber]
    const request = JSON.stringify(this.prepareBundleRequest('flashbots_getUserStats', params))
    const response = await this.request(request)
    if (response.error !== undefined && response.error !== null) {
      return {
        error: {
          message: response.error.message,
          code: response.error.code
        }
      }
    }

    return response.result
  }

  public async getBundleStats(bundleHash: string, blockNumber: number): Promise<GetBundleStatsResponse> {
    const evmBlockNumber = `0x${blockNumber.toString(16)}`

    const params = [{ bundleHash, blockNumber: evmBlockNumber }]
    const request = JSON.stringify(this.prepareBundleRequest('flashbots_getBundleStats', params))
    const response = await this.request(request)
    if (response.error !== undefined && response.error !== null) {
      return {
        error: {
          message: response.error.message,
          code: response.error.code
        }
      }
    }

    return response.result
  }

  public async simulate(
    signedBundledTransactions: Array<string>,
    blockTag: BlockTag,
    stateBlockTag?: BlockTag,
    blockTimestamp?: number
  ): Promise<SimulationResponse> {
    let evmBlockNumber: string
    if (typeof blockTag === 'number') {
      evmBlockNumber = `0x${blockTag.toString(16)}`
    } else {
      const blockTagDetails = await this.genericProvider.getBlock(blockTag)
      const blockDetails = blockTagDetails !== null ? blockTagDetails : await this.genericProvider.getBlock('latest')
      evmBlockNumber = `0x${blockDetails.number.toString(16)}`
    }

    let evmBlockStateNumber: string
    if (typeof stateBlockTag === 'number') {
      evmBlockStateNumber = `0x${stateBlockTag.toString(16)}`
    } else if (!stateBlockTag) {
      evmBlockStateNumber = 'latest'
    } else {
      evmBlockStateNumber = stateBlockTag
    }

    const params: RpcParams = [
      { txs: signedBundledTransactions, blockNumber: evmBlockNumber, stateBlockNumber: evmBlockStateNumber, timestamp: blockTimestamp }
    ]
    const request = JSON.stringify(this.prepareBundleRequest('eth_callBundle', params))
    const response = await this.request(request)
    if (response.error !== undefined && response.error !== null) {
      return {
        error: {
          message: response.error.message,
          code: response.error.code
        }
      }
    }

    const callResult = response.result
    return {
      bundleHash: callResult.bundleHash,
      coinbaseDiff: BigNumber.from(callResult.coinbaseDiff),
      results: callResult.results,
      totalGasUsed: callResult.results.reduce((a: number, b: TransactionSimulation) => a + b.gasUsed, 0),
      firstRevert: callResult.results.find((txSim: TransactionSimulation) => 'revert' in txSim)
    }
  }

  /**
   * Method to send a carrier tx into the public mempool
   *
   * @param bundle  FlashbotsBundle with AT LEAST signed bundled transactions in signedBundledTransactions field obtained
   *  from {@link signBundle} method, and blockTarget.
   * @param validatorPublicKey  The public key of the validator that will be able to decrypt the bundle and include it
   *  into the bundle pool.
   * @param signer  Signer who will sign the carrier transaction.
   * @param carrierTx TransactionRequest whose data field will carry the encrypted bundle : MAY be an incomplete
   *  object which will be populated with default values.
   *
   * @return Promise<TransactionResponse> Promise containing the response for the carrier tx
   * */

  public async sendCarrierTransaction(
    bundle: FlashbotsBundle,
    validatorPublicKey: string,
    signer: Signer,
    carrierTx: TransactionRequest
  ): Promise<TransactionResponse> {
    //RLP-serialize the given bundle
    const serializedBundle = this.rlpSerializeBundle(bundle)

    //Encrypt the encoded bundle with the passed validator pub_key
    const encryptedBundle = encrypt(validatorPublicKey, Buffer.from(serializedBundle))

    //Populate carrier_tx.data as : carrier_tx.data = MEV_Prefix | validator pub_key | Encrypt(validator pub_key, serialized bundle)
    const mevPrefix = `0123` //this is a placeholder!

    let payload = `0x`
    payload += mevPrefix
    payload += validatorPublicKey
    payload += encryptedBundle.toString('hex')

    carrierTx.data = payload

    //Check if carrier_tx has minimum params, populate with defaults if not
    /*
     The following statement is intended to be used in order to support any type of incomplete TransactionRequest
     received, populating it with default values if any one is missing
     */
    await this.populateCarrierTransaction(carrierTx, signer)

    //Sign the transaction received as param with passed signer
    const signedTx = await signer.signTransaction(carrierTx)

    //Propagate carrier_tx into the public mempool and return Promise<TransactionResponse> for the carrier_tx
    return this.genericProvider.sendTransaction(signedTx)
  }

  /**
   * A private method to encode a FlashbotsBundle following the RLP serialization standard
   * @param bundle the FlashbotsBundle instance to be serialized
   * @return string the rlp encoded bundle
   * @private
   */
  private rlpSerializeBundle(bundle: FlashbotsBundle): string {
    if (bundle.signedBundledTransactions === undefined || bundle.signedBundledTransactions.length === 0)
      throw Error('Bundle has no transactions')
    if (bundle.options === undefined) bundle.options = {}

    const fields = [
      bundle.signedBundledTransactions,
      this.formatNumber(bundle.blockTarget || 0),
      this.formatNumber(bundle.options.minTimestamp || 0),
      this.formatNumber(bundle.options.maxTimestamp || 0),
      bundle.options.revertingTxHashes || []
    ]
    return encode(fields)
  }

  private formatNumber(num: number): string {
    const hexNum = num.toString(16)
    return hexNum.length % 2 === 0 ? `0x${hexNum}` : `0x0${hexNum}`
  }

  /**
   * A private method to populate {@param carrier}'s missing fields with default values
   * @param carrier an instance of TransactionRequest which will be the tx containing the full payload in its data field
   * @param signer the signer Object which will send the carrier tx
   * @private
   */
  private async populateCarrierTransaction(carrier: TransactionRequest, signer: Signer) {
    if (!('to' in carrier)) throw Error('carrier.to field is missing')

    if (carrier.gasPrice != null) {
      const gasPrice = BigNumber.from(carrier.gasPrice)
      const maxFeePerGas = BigNumber.from(carrier.maxFeePerGas || 0)
      if (!gasPrice.eq(maxFeePerGas)) {
        throw Error('carrier tx EIP-1559 mismatch: gasPrice != maxFeePerGas')
      }
    }
    const latestBlock = await this.genericProvider.getBlock('latest')
    const blocksInFuture = 5
    const maxBaseFeeInFuture = FlashbotsBundleProvider.getMaxBaseFeeInFutureBlock(<BigNumber>latestBlock.baseFeePerGas, blocksInFuture)

    carrier.type = 2
    carrier.chainId = carrier.chainId || 1
    carrier.nonce = carrier.nonce || (await this.genericProvider.getTransactionCount(signer.getAddress()))
    carrier.maxPriorityFeePerGas = carrier.maxPriorityFeePerGas || ethers.utils.parseUnits('1.5', 'gwei')
    carrier.maxFeePerGas = carrier.maxFeePerGas || maxBaseFeeInFuture.add(carrier.maxPriorityFeePerGas)
    carrier.gasLimit = carrier.gasLimit || (await this.genericProvider.estimateGas(carrier))
    carrier.value = carrier.value || 0
    carrier.accessList = carrier.accessList || []
  }

  private async request(request: string) {
    const connectionInfo = { ...this.connectionInfo }
    connectionInfo.headers = {
      'X-Flashbots-Signature': `${await this.authSigner.getAddress()}:${await this.authSigner.signMessage(id(request))}`,
      ...this.connectionInfo.headers
    }
    return fetchJson(connectionInfo, request)
  }

  private async fetchReceipts(bundledTransactions: Array<TransactionAccountNonce>): Promise<Array<TransactionReceipt>> {
    return Promise.all(bundledTransactions.map((bundledTransaction) => this.genericProvider.getTransactionReceipt(bundledTransaction.hash)))
  }

  private prepareBundleRequest(
    method: 'eth_callBundle' | 'eth_sendBundle' | 'flashbots_getUserStats' | 'flashbots_getBundleStats',
    params: RpcParams
  ) {
    return {
      method: method,
      params: params,
      id: this._nextId++,
      jsonrpc: '2.0'
    }
  }
}
