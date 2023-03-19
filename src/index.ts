import { BlockTag, TransactionReceipt, TransactionRequest } from '@ethersproject/abstract-provider'
import { Networkish } from '@ethersproject/networks'
import { BaseProvider } from '@ethersproject/providers'
import { ConnectionInfo, fetchJson } from '@ethersproject/web'
import { BigNumber, ethers, providers, Signer } from 'ethers'
import { id, keccak256 } from 'ethers/lib/utils'
import { serialize } from '@ethersproject/transactions'

export const DEFAULT_FLASHBOTS_RELAY = 'https://relay.flashbots.net'
export const BASE_FEE_MAX_CHANGE_DENOMINATOR = 8

export enum FlashbotsBundleResolution {
  BundleIncluded,
  BlockPassedWithoutInclusion,
  AccountNonceTooHigh
}

export enum FlashbotsTransactionResolution {
  TransactionIncluded,
  TransactionDropped
}

export enum FlashbotsBundleConflictType {
  NoConflict,
  NonceCollision,
  Error,
  CoinbasePayment,
  GasUsed,
  NoBundlesInBlock
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
  replacementUuid?: string
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
  bundleHash: string
}

export interface FlashbotsPrivateTransactionResponse {
  transaction: TransactionAccountNonce
  wait: () => Promise<FlashbotsTransactionResolution>
  simulate: () => Promise<SimulationResponse>
  receipts: () => Promise<Array<TransactionReceipt>>
}

export interface TransactionSimulationBase {
  txHash: string
  gasUsed: number
  gasFees: string
  gasPrice: string
  toAddress: string
  fromAddress: string
  coinbaseDiff: string
}

export interface TransactionSimulationSuccess extends TransactionSimulationBase {
  value: string
  ethSentToCoinbase: string
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
  bundleGasPrice: BigNumber
  bundleHash: string
  coinbaseDiff: BigNumber
  ethSentToCoinbase: BigNumber
  gasFees: BigNumber
  results: Array<TransactionSimulation>
  totalGasUsed: number
  stateBlockNumber: number
  firstRevert?: TransactionSimulation
}

export type SimulationResponse = SimulationResponseSuccess | RelayResponseError

export type FlashbotsTransaction = FlashbotsTransactionResponse | RelayResponseError

export type FlashbotsPrivateTransaction = FlashbotsPrivateTransactionResponse | RelayResponseError

export interface GetUserStatsResponseSuccess {
  is_high_priority: boolean
  all_time_miner_payments: string
  all_time_gas_simulated: string
  last_7d_miner_payments: string
  last_7d_gas_simulated: string
  last_1d_miner_payments: string
  last_1d_gas_simulated: string
}

export interface GetUserStatsResponseSuccessV2 {
  isHighPriority: boolean
  allTimeValidatorPayments: string
  allTimeGasSimulated: string
  last7dValidatorPayments: string
  last7dGasSimulated: string
  last1dValidatorPayments: string
  last1dGasSimulated: string
}

export type GetUserStatsResponse = GetUserStatsResponseSuccess | RelayResponseError
export type GetUserStatsResponseV2 = GetUserStatsResponseSuccessV2 | RelayResponseError

interface PubKeyTimestamp {
  pubkey: string
  timestamp: string
}

export interface GetBundleStatsResponseSuccess {
  isSimulated: boolean
  isSentToMiners: boolean
  isHighPriority: boolean
  simulatedAt: string
  submittedAt: string
  sentToMinersAt: string
  consideredByBuildersAt: Array<PubKeyTimestamp>
  sealedByBuildersAt: Array<PubKeyTimestamp>
}

export interface GetBundleStatsResponseSuccessV2 {
  isSimulated: boolean
  isHighPriority: boolean
  simulatedAt: string
  receivedAt: string
  consideredByBuildersAt: Array<PubKeyTimestamp>
  sealedByBuildersAt: Array<PubKeyTimestamp>
}

export type GetBundleStatsResponse = GetBundleStatsResponseSuccess | RelayResponseError
export type GetBundleStatsResponseV2 = GetBundleStatsResponseSuccessV2 | RelayResponseError

interface BlocksApiResponseTransactionDetails {
  transaction_hash: string
  tx_index: number
  bundle_type: 'rogue' | 'flashbots' | 'mempool'
  bundle_index: number
  block_number: number
  eoa_address: string
  to_address: string
  gas_used: number
  gas_price: string
  coinbase_transfer: string
  eth_sent_to_fee_recipient: string
  total_miner_reward: string
  fee_recipient_eth_diff: string
}

interface BlocksApiResponseBlockDetails {
  block_number: number
  fee_recipient: string
  fee_recipient_eth_diff: string
  miner_reward: string
  miner: string
  coinbase_transfers: string
  eth_sent_to_fee_recipient: string
  gas_used: number
  gas_price: string
  transactions: Array<BlocksApiResponseTransactionDetails>
}

export interface BlocksApiResponse {
  latest_block_number: number
  blocks: Array<BlocksApiResponseBlockDetails>
}

export interface FlashbotsBundleConflict {
  conflictingBundle: Array<BlocksApiResponseTransactionDetails>
  initialSimulation: SimulationResponseSuccess
  conflictType: FlashbotsBundleConflictType
}

export interface FlashbotsGasPricing {
  txCount: number
  gasUsed: number
  gasFeesPaidBySearcher: BigNumber
  priorityFeesReceivedByMiner: BigNumber
  ethSentToCoinbase: BigNumber
  effectiveGasPriceToSearcher: BigNumber
  effectivePriorityFeeToMiner: BigNumber
}

export interface FlashbotsBundleConflictWithGasPricing extends FlashbotsBundleConflict {
  targetBundleGasPricing: FlashbotsGasPricing
  conflictingBundleGasPricing?: FlashbotsGasPricing
}

export interface FlashbotsCancelBidResponseSuccess {
  bundleHashes: string[]
}

export type FlashbotsCancelBidResponse = FlashbotsCancelBidResponseSuccess | RelayResponseError

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

  static getBaseFeeInNextBlock(currentBaseFeePerGas: BigNumber, currentGasUsed: BigNumber, currentGasLimit: BigNumber): BigNumber {
    const currentGasTarget = currentGasLimit.div(2)

    if (currentGasUsed.eq(currentGasTarget)) {
      return currentBaseFeePerGas
    } else if (currentGasUsed.gt(currentGasTarget)) {
      const gasUsedDelta = currentGasUsed.sub(currentGasTarget)
      const baseFeePerGasDelta = currentBaseFeePerGas.mul(gasUsedDelta).div(currentGasTarget).div(BASE_FEE_MAX_CHANGE_DENOMINATOR)

      return currentBaseFeePerGas.add(baseFeePerGasDelta)
    } else {
      const gasUsedDelta = currentGasTarget.sub(currentGasUsed)
      const baseFeePerGasDelta = currentBaseFeePerGas.mul(gasUsedDelta).div(currentGasTarget).div(BASE_FEE_MAX_CHANGE_DENOMINATOR)

      return currentBaseFeePerGas.sub(baseFeePerGasDelta)
    }
  }

  static generateBundleHash(txHashes: Array<string>): string {
    const concatenatedHashes = txHashes.map((txHash) => txHash.slice(2)).join('')
    return keccak256(`0x${concatenatedHashes}`)
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
      revertingTxHashes: opts?.revertingTxHashes,
      replacementUuid: opts?.replacementUuid
    }

    const request = JSON.stringify(this.prepareRelayRequest('eth_sendBundle', [params]))
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
      wait: () => this.waitForBlock(bundleTransactions, targetBlockNumber, TIMEOUT_MS),
      simulate: () =>
        this.simulate(
          bundleTransactions.map((tx) => tx.signedTransaction),
          targetBlockNumber,
          undefined,
          opts?.minTimestamp
        ),
      receipts: () => this.fetchReceipts(bundleTransactions),
      bundleHash: response?.result?.bundleHash
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

  public async cancelBundles(bidId: string): Promise<FlashbotsCancelBidResponse> {
    const params = {
      replacementUuid: bidId
    }

    const request = JSON.stringify(this.prepareRelayRequest('eth_cancelBundle', [params]))
    const response = await this.request(request)

    if (response.error !== undefined && response.error !== null) {
      return {
        error: {
          message: response.error.message,
          code: response.error.code
        }
      }
    }
    return {
      bundleHashes: response.result
    }
  }

  public async sendPrivateTransaction(
    transaction: FlashbotsBundleTransaction | FlashbotsBundleRawTransaction,
    opts?: {
      maxBlockNumber?: number
      simulationTimestamp?: number
    }
  ): Promise<FlashbotsPrivateTransaction> {
    let signedTransaction: string
    if ('signedTransaction' in transaction) {
      signedTransaction = transaction.signedTransaction
    } else {
      signedTransaction = await transaction.signer.signTransaction(transaction.transaction)
    }
    const startBlockNumberPromise = this.genericProvider.getBlockNumber()
    const params = {
      tx: signedTransaction,
      maxBlockNumber: opts?.maxBlockNumber
    }
    const request = JSON.stringify(this.prepareRelayRequest('eth_sendPrivateTransaction', [params]))
    const response = await this.request(request)
    if (response.error !== undefined && response.error !== null) {
      return {
        error: {
          message: response.error.message,
          code: response.error.code
        }
      }
    }

    const transactionDetails = ethers.utils.parseTransaction(signedTransaction)
    const privateTransaction = {
      signedTransaction: signedTransaction,
      hash: ethers.utils.keccak256(signedTransaction),
      account: transactionDetails.from || '0x0',
      nonce: transactionDetails.nonce
    }
    const startBlockNumber = await startBlockNumberPromise

    return {
      transaction: privateTransaction,
      wait: () => this.waitForTxInclusion(privateTransaction.hash, opts?.maxBlockNumber || startBlockNumber + 25, TIMEOUT_MS),
      simulate: () => this.simulate([privateTransaction.signedTransaction], startBlockNumber, undefined, opts?.simulationTimestamp),
      receipts: () => this.fetchReceipts([privateTransaction])
    }
  }

  public async cancelPrivateTransaction(txHash: string): Promise<boolean | RelayResponseError> {
    const params = {
      txHash
    }
    const request = JSON.stringify(this.prepareRelayRequest('eth_cancelPrivateTransaction', [params]))
    const response = await this.request(request)
    if (response.error !== undefined && response.error !== null) {
      return {
        error: {
          message: response.error.message,
          code: response.error.code
        }
      }
    }

    return true
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

  private waitForBlock(transactionAccountNonces: Array<TransactionAccountNonce>, targetBlockNumber: number, timeout: number) {
    return new Promise<FlashbotsBundleResolution>((resolve, reject) => {
      let timer: NodeJS.Timer | null = null
      let done = false

      const minimumNonceByAccount = transactionAccountNonces.reduce((acc, accountNonce) => {
        if (accountNonce.nonce > 0) {
          if (!acc[accountNonce.account] || accountNonce.nonce < acc[accountNonce.account]) {
            acc[accountNonce.account] = accountNonce.nonce
          }
        }
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

      if (timeout > 0) {
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

  private waitForTxInclusion(transactionHash: string, maxBlockNumber: number, timeout: number) {
    return new Promise<FlashbotsTransactionResolution>((resolve, reject) => {
      let timer: NodeJS.Timer | null = null
      let done = false

      // runs on new block event
      const handler = async (blockNumber: number) => {
        if (blockNumber <= maxBlockNumber) {
          // check tx status on mainnet
          const sentTxStatus = await this.genericProvider.getTransaction(transactionHash)
          if (sentTxStatus && sentTxStatus.confirmations >= 1) {
            resolve(FlashbotsTransactionResolution.TransactionIncluded)
          } else {
            return
          }
        } else {
          // tx not included in specified range, bail
          this.genericProvider.removeListener('block', handler)
          resolve(FlashbotsTransactionResolution.TransactionDropped)
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

      // time out if we've been trying for too long
      if (timeout > 0) {
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
    const request = JSON.stringify(this.prepareRelayRequest('flashbots_getUserStats', params))
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

  public async getUserStatsV2(): Promise<GetUserStatsResponseV2> {
    const blockDetails = await this.genericProvider.getBlock('latest')
    const evmBlockNumber = `0x${blockDetails.number.toString(16)}`
    const params = [{ blockNumber: evmBlockNumber }]
    const request = JSON.stringify(this.prepareRelayRequest('flashbots_getUserStatsV2', params))
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
    const request = JSON.stringify(this.prepareRelayRequest('flashbots_getBundleStats', params))
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

  public async getBundleStatsV2(bundleHash: string, blockNumber: number): Promise<GetBundleStatsResponseV2> {
    const evmBlockNumber = `0x${blockNumber.toString(16)}`

    const params = [{ bundleHash, blockNumber: evmBlockNumber }]
    const request = JSON.stringify(this.prepareRelayRequest('flashbots_getBundleStatsV2', params))
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
      {
        txs: signedBundledTransactions,
        blockNumber: evmBlockNumber,
        stateBlockNumber: evmBlockStateNumber,
        timestamp: blockTimestamp
      }
    ]
    const request = JSON.stringify(this.prepareRelayRequest('eth_callBundle', params))
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
      bundleGasPrice: BigNumber.from(callResult.bundleGasPrice),
      bundleHash: callResult.bundleHash,
      coinbaseDiff: BigNumber.from(callResult.coinbaseDiff),
      ethSentToCoinbase: BigNumber.from(callResult.ethSentToCoinbase),
      gasFees: BigNumber.from(callResult.gasFees),
      results: callResult.results,
      stateBlockNumber: callResult.stateBlockNumber,
      totalGasUsed: callResult.results.reduce((a: number, b: TransactionSimulation) => a + b.gasUsed, 0),
      firstRevert: callResult.results.find((txSim: TransactionSimulation) => 'revert' in txSim || 'error' in txSim)
    }
  }

  private calculateBundlePricing(
    bundleTransactions: Array<BlocksApiResponseTransactionDetails | TransactionSimulation>,
    baseFee: BigNumber
  ) {
    const bundleGasPricing = bundleTransactions.reduce(
      (acc, transactionDetail) => {
        const gasUsed = 'gas_used' in transactionDetail ? transactionDetail.gas_used : transactionDetail.gasUsed
        const gasPricePaidBySearcher = BigNumber.from(
          'gas_price' in transactionDetail ? transactionDetail.gas_price : transactionDetail.gasPrice
        )
        const priorityFeeReceivedByMiner = gasPricePaidBySearcher.sub(baseFee)
        const ethSentToCoinbase =
          'coinbase_transfer' in transactionDetail
            ? transactionDetail.coinbase_transfer
            : 'ethSentToCoinbase' in transactionDetail
            ? transactionDetail.ethSentToCoinbase
            : BigNumber.from(0)
        return {
          gasUsed: acc.gasUsed + gasUsed,
          gasFeesPaidBySearcher: acc.gasFeesPaidBySearcher.add(gasPricePaidBySearcher.mul(gasUsed)),
          priorityFeesReceivedByMiner: acc.priorityFeesReceivedByMiner.add(priorityFeeReceivedByMiner.mul(gasUsed)),
          ethSentToCoinbase: acc.ethSentToCoinbase.add(ethSentToCoinbase)
        }
      },
      {
        gasUsed: 0,
        gasFeesPaidBySearcher: BigNumber.from(0),
        priorityFeesReceivedByMiner: BigNumber.from(0),
        ethSentToCoinbase: BigNumber.from(0)
      }
    )
    const effectiveGasPriceToSearcher =
      bundleGasPricing.gasUsed > 0
        ? bundleGasPricing.ethSentToCoinbase.add(bundleGasPricing.gasFeesPaidBySearcher).div(bundleGasPricing.gasUsed)
        : BigNumber.from(0)
    const effectivePriorityFeeToMiner =
      bundleGasPricing.gasUsed > 0
        ? bundleGasPricing.ethSentToCoinbase.add(bundleGasPricing.priorityFeesReceivedByMiner).div(bundleGasPricing.gasUsed)
        : BigNumber.from(0)
    return {
      ...bundleGasPricing,
      txCount: bundleTransactions.length,
      effectiveGasPriceToSearcher,
      effectivePriorityFeeToMiner
    }
  }

  public async getConflictingBundle(
    targetSignedBundledTransactions: Array<string>,
    targetBlockNumber: number
  ): Promise<FlashbotsBundleConflictWithGasPricing> {
    const baseFee = (await this.genericProvider.getBlock(targetBlockNumber)).baseFeePerGas || BigNumber.from(0)
    const conflictDetails = await this.getConflictingBundleWithoutGasPricing(targetSignedBundledTransactions, targetBlockNumber)
    return {
      ...conflictDetails,
      targetBundleGasPricing: this.calculateBundlePricing(conflictDetails.initialSimulation.results, baseFee),
      conflictingBundleGasPricing:
        conflictDetails.conflictingBundle.length > 0 ? this.calculateBundlePricing(conflictDetails.conflictingBundle, baseFee) : undefined
    }
  }

  public async getConflictingBundleWithoutGasPricing(
    targetSignedBundledTransactions: Array<string>,
    targetBlockNumber: number
  ): Promise<FlashbotsBundleConflict> {
    const [initialSimulation, competingBundles] = await Promise.all([
      this.simulate(targetSignedBundledTransactions, targetBlockNumber, targetBlockNumber - 1),
      this.fetchBlocksApi(targetBlockNumber)
    ])
    if (competingBundles.latest_block_number <= targetBlockNumber) {
      throw new Error('Blocks-api has not processed target block')
    }
    if ('error' in initialSimulation || initialSimulation.firstRevert !== undefined) {
      throw new Error('Target bundle errors at top of block')
    }
    const blockDetails = competingBundles.blocks[0]
    if (blockDetails === undefined) {
      return {
        initialSimulation,
        conflictType: FlashbotsBundleConflictType.NoBundlesInBlock,
        conflictingBundle: []
      }
    }
    const bundleTransactions = blockDetails.transactions
    const bundleCount = bundleTransactions[bundleTransactions.length - 1].bundle_index + 1
    const signedPriorBundleTransactions = []
    for (let currentBundleId = 0; currentBundleId < bundleCount; currentBundleId++) {
      const currentBundleTransactions = bundleTransactions.filter((bundleTransaction) => bundleTransaction.bundle_index === currentBundleId)
      const currentBundleSignedTxs = await Promise.all(
        currentBundleTransactions.map(async (competitorBundleBlocksApiTx) => {
          const tx = await this.genericProvider.getTransaction(competitorBundleBlocksApiTx.transaction_hash)
          if (tx.raw !== undefined) {
            return tx.raw
          }
          if (tx.v !== undefined && tx.r !== undefined && tx.s !== undefined) {
            if (tx.type === 2) {
              delete tx.gasPrice
            }
            return serialize(tx, {
              v: tx.v,
              r: tx.r,
              s: tx.s
            })
          }
          throw new Error('Could not get raw tx')
        })
      )
      signedPriorBundleTransactions.push(...currentBundleSignedTxs)
      const competitorAndTargetBundleSimulation = await this.simulate(
        [...signedPriorBundleTransactions, ...targetSignedBundledTransactions],
        targetBlockNumber,
        targetBlockNumber - 1
      )

      if ('error' in competitorAndTargetBundleSimulation) {
        if (competitorAndTargetBundleSimulation.error.message.startsWith('err: nonce too low:')) {
          return {
            conflictType: FlashbotsBundleConflictType.NonceCollision,
            initialSimulation,
            conflictingBundle: currentBundleTransactions
          }
        }
        throw new Error('Simulation error')
      }
      const targetSimulation = competitorAndTargetBundleSimulation.results.slice(-targetSignedBundledTransactions.length)
      for (let j = 0; j < targetSimulation.length; j++) {
        const targetSimulationTx = targetSimulation[j]
        const initialSimulationTx = initialSimulation.results[j]
        if ('error' in targetSimulationTx || 'error' in initialSimulationTx) {
          if ('error' in targetSimulationTx != 'error' in initialSimulationTx) {
            return {
              conflictType: FlashbotsBundleConflictType.Error,
              initialSimulation,
              conflictingBundle: currentBundleTransactions
            }
          }
          continue
        }
        if (targetSimulationTx.ethSentToCoinbase != initialSimulationTx.ethSentToCoinbase) {
          return {
            conflictType: FlashbotsBundleConflictType.CoinbasePayment,
            initialSimulation,
            conflictingBundle: currentBundleTransactions
          }
        }
        if (targetSimulationTx.gasUsed != initialSimulation.results[j].gasUsed) {
          return {
            conflictType: FlashbotsBundleConflictType.GasUsed,
            initialSimulation,
            conflictingBundle: currentBundleTransactions
          }
        }
      }
    }
    return {
      conflictType: FlashbotsBundleConflictType.NoConflict,
      initialSimulation,
      conflictingBundle: []
    }
  }

  public async fetchBlocksApi(blockNumber: number): Promise<BlocksApiResponse> {
    return fetchJson(`https://blocks.flashbots.net/v1/blocks?block_number=${blockNumber}`)
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

  private prepareRelayRequest(
    method:
      | 'eth_callBundle'
      | 'eth_cancelBundle'
      | 'eth_sendBundle'
      | 'eth_sendPrivateTransaction'
      | 'eth_cancelPrivateTransaction'
      | 'flashbots_getUserStats'
      | 'flashbots_getBundleStats'
      | 'flashbots_getUserStatsV2'
      | 'flashbots_getBundleStatsV2',
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
