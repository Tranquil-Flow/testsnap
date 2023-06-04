import { defaultSnapOrigin } from '../config';
import { GetSnapsResponse, Snap } from '../types';
import { BigNumberish, Contract, ethers, Wallet } from 'ethers';
import type { SnapProvider } from '@metamask/snap-types';
import type { BIP44CoinTypeNode } from '@metamask/key-tree';
import { getBIP44AddressKeyDeriver } from '@metamask/key-tree';

/**
 * Get the installed snaps in MetaMask.
 *
 * @returns The snaps installed in MetaMask.
 */
export const getSnaps = async (): Promise<GetSnapsResponse> => {
  return (await window.ethereum.request({
    method: 'wallet_getSnaps',
  })) as unknown as GetSnapsResponse;
};

/**
 * Connect a snap to MetaMask.
 *
 * @param snapId - The ID of the snap.
 * @param params - The params to pass with the snap to connect.
 */
export const connectSnap = async (
  snapId: string = defaultSnapOrigin,
  params: Record<'version' | string, unknown> = {},
) => {
  await window.ethereum.request({
    method: 'wallet_requestSnaps',
    params: {
      [snapId]: params,
    },
  });
};

/**
 * Get the snap from MetaMask.
 *
 * @param version - The version of the snap to install (optional).
 * @returns The snap object returned by the extension.
 */
export const getSnap = async (version?: string): Promise<Snap | undefined> => {
  try {
    const snaps = await getSnaps();

    return Object.values(snaps).find(
      (snap) =>
        snap.id === defaultSnapOrigin && (!version || snap.version === version),
    );
  } catch (e) {
    console.log('Failed to obtain installed snap', e);
    return undefined;
  }
};


declare const wallet: SnapProvider;
const provider = ethers.getDefaultProvider('goerli')

async function getSigner(provider: ethers.Provider): Promise<Wallet> {
  // Metamask uses default HD derivation path
  // https://metamask.zendesk.com/hc/en-us/articles/360060331752-Importing-a-seed-phrase-from-another-wallet-software-derivation-path
  const ethereumNode = (await wallet.request({
    method: 'snap_getBip44Entropy',
  })) as unknown as BIP44CoinTypeNode;
  let deriveEthereumAccount: any; 
  deriveEthereumAccount = getBIP44AddressKeyDeriver(ethereumNode);
  // A bug:
  // The current public version of @metamask/key-tree's derive function returns the private key and chain code in a single buffer
  // Ether.js also accepts a 64 byte buffer without errors and returns wrong keys
  // Related issue: https://github.com/ethers-io/ethers.js/issues/2926
  // TODO(ritave): Update to newest key-tree when available and use deriveEthereumAccount(0).privateKey
  const mainAccountKey = deriveEthereumAccount(0).slice(0, 32);
  return new Wallet(mainAccountKey, provider);
}


/**
 * Runs an empty transaction to trigger a roundup for testing purposes
 */

const COMMON = {
  contracts: {
    routerV2: {
      abi: [
        'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)',
        'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
      ],
    },
    factory: {
      abi: [
        'function getPair(address tokenA, address tokenB) external view returns (address pair)',
      ],
    },
    pair: {
      abi: ['event Sync(uint112 reserve0, uint112 reserve1)'],
    },
  },
};

const UNISWAP = {
  contracts: {
    routerV2: {
      address: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
      abi: COMMON.contracts.routerV2.abi,
    },
    factory: {
      address: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
      abi: COMMON.contracts.factory.abi,
    },
    pair: {
      abi: COMMON.contracts.pair.abi,
    },
  },
};

export const ERC20 = {
  abi: [
    'function name() public view returns (string)',
    'function symbol() public view returns (string)',
    'function balanceOf(address _owner) public view returns (uint256 balance)',
    'function approve(address _spender, uint256 _value) public returns (bool success)',
  ],
};

function timestamp(): number {
  return Math.round(new Date().getTime() / 1000);
}


export const testRoundup = async () => {


  // We use a private keys directly to skip Metamask send transaction user requests
  const signer = await getSigner(provider);

  const swapAmount = 1;
  const tokenSelling = 0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6;  // Goerli WETH
  const tokenBuying = 0x63bfb2118771bd0da7a6936667a7bb705a06c1ba;   // Goerli LINK
  const tokenA = new Contract("tokenSelling", ERC20.abi, signer);
  // POTENTIAL BUG REMOVE QUOTATION MARKS ON tokenSelling

  const uniswapRouterV2 = new Contract(
    UNISWAP.contracts.routerV2.address,
    UNISWAP.contracts.routerV2.abi,
    signer,
  );

  // Approve token for selling
  await (
        await tokenA.approve(uniswapRouterV2.address, swapAmount)
      ).wait();

  
  // Sell WETH for LINK
  await (
        await uniswapRouterV2.swapExactTokensForTokens(
          swapAmount,
          1,
          [tokenSelling, tokenBuying],
          signer.address,
          timestamp() + 300,
        )
      ).wait();
};

export const isLocalSnap = (snapId: string) => snapId.startsWith('local:');
