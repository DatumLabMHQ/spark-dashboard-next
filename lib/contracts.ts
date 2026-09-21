import { createPublicClient, http, fallback, type Address } from "viem"
import { mainnet } from "viem/chains"

// --- viem client with fallback RPCs ---
// mevblocker is first because it accepts wide eth_getLogs ranges (5M blocks in one call)
// which the other public RPCs reject. llamarpc/ankr/publicnode kept as fallback for
// cheaper reads (blockNumber, balances, multicall).
export const client = createPublicClient({
  chain: mainnet,
  transport: fallback([
    http("https://rpc.mevblocker.io"),
    http("https://eth.llamarpc.com"),
    http("https://ethereum.publicnode.com"),
    http("https://rpc.ankr.com/eth"),
  ]),
})

// --- SparkLend contract addresses (Ethereum mainnet) ---
export const POOL_ADDRESSES_PROVIDER: Address =
  "0x02C3eA4e34C0cBd694D2adFa2c690EECbC1793eE"
export const POOL: Address =
  "0xC13e21B648A5Ee794902342038FF3aDAB66BE987"

// --- Sky/Spark distribution reward addresses ---
// Distribution Rewards are paid as monthly USDS mints from Sky's Pause Proxy
// (via executive spell Cast) into Spark's governance proxy.
export const USDS_TOKEN: Address =
  "0xdC035D45d973E3EC169d2276DDab16f1e407384F"
export const MCD_PAUSE_PROXY: Address =
  "0xbE286431454714F511008713973d3B053A2d38f3"
export const SPARK_PROXY: Address =
  "0x3300f198988e4C9C63F75dF86De36421f06af8c4"

// Spark Operations Multisig — receives USDS from the SubDAO Proxy each cycle,
// places the CoW Swap TWAP orders (USDS→SPK), and returns SPK to the SubDAO
// Proxy. Buyback executions are visible as ERC-20 transfers on this address
// and as filled orders in the CoW orderbook API.
export const SPARK_OPS_MULTISIG: Address =
  "0x2E1b01adABB8D4981863394bEa23a1263CBaeDfC"

// --- Treasury assets held by SPARK_PROXY (checked against Sam MacPherson's
// Aug 2026 "Total Treasury" chart). Extend when Phoenix Labs' monthly
// proxy-management post adds new tokens.
export const SPK_TOKEN: Address =
  "0xc20059e0317DE91738d13af027DfC4a50781b066"
export const USDC_TOKEN: Address =
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
export const PYUSD_TOKEN: Address =
  "0x6c3ea9036406852006290770BEdFcAbA0e23A0e8"

export const TREASURY_ASSETS: Array<{ address: Address; symbol: string; decimals: number }> = [
  { address: USDS_TOKEN,  symbol: "USDS",  decimals: 18 },
  { address: USDC_TOKEN,  symbol: "USDC",  decimals: 6  },
  { address: PYUSD_TOKEN, symbol: "PYUSD", decimals: 6  },
  { address: SPK_TOKEN,   symbol: "SPK",   decimals: 18 },
]

// --- ABI fragments (minimal, only what we call) ---

export const poolAddressesProviderAbi = [
  {
    name: "getPoolDataProvider",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    name: "getPriceOracle",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const

export const poolDataProviderAbi = [
  {
    name: "getAllReservesTokens",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        type: "tuple[]",
        components: [
          { name: "symbol", type: "string" },
          { name: "tokenAddress", type: "address" },
        ],
      },
    ],
  },
  {
    name: "getReserveData",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [
      { name: "unbacked", type: "uint256" },
      { name: "accruedToTreasuryScaled", type: "uint256" },
      { name: "totalAToken", type: "uint256" },
      { name: "totalStableDebt", type: "uint256" },
      { name: "totalVariableDebt", type: "uint256" },
      { name: "liquidityRate", type: "uint256" },
      { name: "variableBorrowRate", type: "uint256" },
      { name: "stableBorrowRate", type: "uint256" },
      { name: "averageStableBorrowRate", type: "uint256" },
      { name: "liquidityIndex", type: "uint256" },
      { name: "variableBorrowIndex", type: "uint256" },
      { name: "lastUpdateTimestamp", type: "uint40" },
    ],
  },
  {
    name: "getReserveConfigurationData",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [
      { name: "decimals", type: "uint256" },
      { name: "ltv", type: "uint256" },
      { name: "liquidationThreshold", type: "uint256" },
      { name: "liquidationBonus", type: "uint256" },
      { name: "reserveFactor", type: "uint256" },
      { name: "usageAsCollateralEnabled", type: "bool" },
      { name: "borrowingEnabled", type: "bool" },
      { name: "stableBorrowRateEnabled", type: "bool" },
      { name: "isActive", type: "bool" },
      { name: "isFrozen", type: "bool" },
    ],
  },
  {
    name: "getReserveCaps",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [
      { name: "borrowCap", type: "uint256" },
      { name: "supplyCap", type: "uint256" },
    ],
  },
  {
    name: "getUserReserveData",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "asset", type: "address" },
      { name: "user", type: "address" },
    ],
    outputs: [
      { name: "currentATokenBalance", type: "uint256" },
      { name: "currentStableDebt", type: "uint256" },
      { name: "currentVariableDebt", type: "uint256" },
      { name: "principalStableDebt", type: "uint256" },
      { name: "scaledVariableDebt", type: "uint256" },
      { name: "stableBorrowRate", type: "uint256" },
      { name: "liquidityRate", type: "uint256" },
      { name: "stableRateLastUpdated", type: "uint40" },
      { name: "usageAsCollateralEnabled", type: "bool" },
    ],
  },
] as const

export const poolAbi = [
  {
    name: "getReserveData",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [
      {
        name: "data",
        type: "tuple",
        components: [
          { name: "configuration", type: "uint256" },
          { name: "liquidityIndex", type: "uint128" },
          { name: "currentLiquidityRate", type: "uint128" },
          { name: "variableBorrowIndex", type: "uint128" },
          { name: "currentVariableBorrowRate", type: "uint128" },
          { name: "currentStableBorrowRate", type: "uint128" },
          { name: "lastUpdateTimestamp", type: "uint40" },
          { name: "id", type: "uint16" },
          { name: "aTokenAddress", type: "address" },
          { name: "stableDebtTokenAddress", type: "address" },
          { name: "variableDebtTokenAddress", type: "address" },
          { name: "interestRateStrategyAddress", type: "address" },
          { name: "accruedToTreasury", type: "uint128" },
          { name: "unbacked", type: "uint128" },
          { name: "isolationModeTotalDebt", type: "uint128" },
        ],
      },
    ],
  },
  {
    name: "getUserAccountData",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      { name: "totalCollateralBase", type: "uint256" },
      { name: "totalDebtBase", type: "uint256" },
      { name: "availableBorrowsBase", type: "uint256" },
      { name: "currentLiquidationThreshold", type: "uint256" },
      { name: "ltv", type: "uint256" },
      { name: "healthFactor", type: "uint256" },
    ],
  },
] as const

export const poolEventsAbi = [
  {
    name: "Supply",
    type: "event",
    inputs: [
      { name: "reserve", type: "address", indexed: true },
      { name: "user", type: "address", indexed: false },
      { name: "onBehalfOf", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "referralCode", type: "uint16", indexed: true },
    ],
  },
  {
    name: "Borrow",
    type: "event",
    inputs: [
      { name: "reserve", type: "address", indexed: true },
      { name: "user", type: "address", indexed: false },
      { name: "onBehalfOf", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "interestRateMode", type: "uint256", indexed: false },
      { name: "borrowRate", type: "uint256", indexed: false },
      { name: "referralCode", type: "uint16", indexed: true },
    ],
  },
  {
    name: "LiquidationCall",
    type: "event",
    inputs: [
      { name: "collateralAsset", type: "address", indexed: true },
      { name: "debtAsset", type: "address", indexed: true },
      { name: "user", type: "address", indexed: true },
      { name: "debtToCover", type: "uint256", indexed: false },
      { name: "liquidatedCollateralAmount", type: "uint256", indexed: false },
      { name: "liquidator", type: "address", indexed: false },
      { name: "receiveAToken", type: "bool", indexed: false },
    ],
  },
  {
    name: "FlashLoan",
    type: "event",
    inputs: [
      { name: "target", type: "address", indexed: true },
      { name: "initiator", type: "address", indexed: false },
      { name: "asset", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "interestRateMode", type: "uint8", indexed: false },
      { name: "premium", type: "uint256", indexed: false },
      { name: "referralCode", type: "uint16", indexed: true },
    ],
  },
] as const

export const oracleAbi = [
  {
    name: "getAssetsPrices",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "assets", type: "address[]" }],
    outputs: [{ type: "uint256[]" }],
  },
] as const

export const interestRateStrategyAbi = [
  {
    name: "getBaseVariableBorrowRate",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "getVariableRateSlope1",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "getVariableRateSlope2",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "OPTIMAL_USAGE_RATIO",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const
