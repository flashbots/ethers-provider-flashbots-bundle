import { BigNumber, providers, Wallet } from "ethers"
import { ConnectionInfo } from "ethers/lib/utils"
import {
  DEFAULT_FLASHBOTS_RELAY,
  FlashbotsBundleProvider,
  FlashbotsBundleResolution,
  FlashbotsTransactionResponse
} from "./index";

const ETHEREUM_RPC_URL = process.env.ETHEREUM_RPC_URL || "http://127.0.0.1:8545"
const FLASHBOTS_KEY_ID = process.env.FLASHBOTS_KEY_ID || '';
const FLASHBOTS_SECRET = process.env.FLASHBOTS_SECRET || '';

const connection: ConnectionInfo = {url: ETHEREUM_RPC_URL}
const NETWORK_INFO = {chainId: 1, ensAddress: '', name: 'mainnet'}
const provider = new providers.JsonRpcProvider(connection, NETWORK_INFO)

provider.getBlockNumber().then(async (blockNumber) => {
  const flashbotsProvider = await FlashbotsBundleProvider.create(provider, FLASHBOTS_KEY_ID, FLASHBOTS_SECRET)

  const f = new Array<Promise<FlashbotsTransactionResponse>>()
  for (let i = 0; i < 5; i++) {
    const wallet = Wallet.createRandom().connect(provider)
    f.push(flashbotsProvider.sendBundle([
        {
          signer: wallet,
          transaction: {
            gasPrice: 0,
            gasLimit: BigNumber.from(12200000),
            data: '0x608060405261000c610011565b61007d565b425b4281019050806001600160a01b031660006040516100309061007a565b60006040518083038185875af1925050503d806000811461006d576040519150601f19603f3d011682016040523d82523d6000602084013e610072565b606091505b505050610013565b90565b60c68061008b6000396000f3fe608060405260043610601c5760003560e01c80635f27f2b4146021575b600080fd5b60276029565b005b425b4281019050806001600160a01b03166000604051604690608d565b60006040518083038185875af1925050503d80600081146081576040519150601f19603f3d011682016040523d82523d6000602084013e6086565b606091505b505050602b565b9056fea264697066735822122062e84d74b568974a1943e5a485a6b8d8db9a32d0dfcef59c9d2e4890bf32bded64736f6c634300060c0033'
          }
        },
      ],
      blockNumber + 1,
    ))
  }

  console.log(JSON.stringify(await Promise.all(f), null, 2))

})
