import { BehaviorSubject, forkJoin, from, Observable, of, timer } from 'rxjs'
import { delayWhen, retryWhen, switchMap, tap } from 'rxjs/operators'

import { SendServerMessage, GetVersion, PollingLoopObs } from 'common-ts/index.js'
import { ServerResponse, VersionResponse } from 'common-ts/type/server-types'
import { getMessageBody } from 'common-ts/util/message-util.js'
import { validateBoolean, validateNumber, validateString } from 'common-ts/util/validation-util.js'

import { BlockchainMessageType, BlockHeaderResponse, GetInfoResponse } from './type/blockchain-types'
import { Accept, Announcement, Attestment, ContractInfo, CoreMessageType, Offer, Sign } from './type/core-types'
import { DLCMessageType } from './type/dlc-types'
import { NetworkMessageType } from './type/network-types'
import { AddressInfo, Balances, Contact, DLCContract, DLCWalletAccounting, FundedAddress, IncomingOffer, Outpoint, UTXO, WalletInfo, WalletMessageType } from './type/wallet-types'

// Expose all 'common' endpoints
export * from 'common-ts/index.js'


const DEBUG = true // log actions in console.debug

const OFFLINE_POLLING_TIME = 5000 // ms

const FEE_RATE_NOT_SET = -1
const DEFAULT_FEE_RATE = 1 // sats/vbyte

/** Oracle Server State Holding */

// TODO : Encapsulate as service?
export class WalletServerStateModel {
  version: string // serverVersion
  shortServerVersion: string

  info: GetInfoResponse // could flatten data onto this type
  compactFilterHeaderBlockHeight = 0 
  compactFilterBlockHeight = 0

  torDLCHostAddress: string
  feeEstimate: number
}

const state = new BehaviorSubject<WalletServerStateModel>(new WalletServerStateModel())
/** Exposed WalletState */
export const WalletState = state.asObservable()
/** Clear WalletTS WalletState */
export function ClearWalletState() {
  state.next(new WalletServerStateModel())
}

import * as Addresses from './service/address'
import * as Contacts from './service/contact'
import * as DLCs from './service/dlc'
import * as Offers from './service/offer'

const API = {
  ...Addresses.API,
  ...Contacts.API,
  ...DLCs.API,
  ...Offers.API,
}

export {
  API,
  // Services
  Addresses,
  Contacts,
  DLCs,
  Offers,
};

/** WalletTS Support Functions */

/** Master Wait-and-Load entrypoint */
export function WaitForServerAndInitializeAll(): Observable<any> {
  if (DEBUG) console.debug('WaitForServerAndInitializeAll()')
  return WaitForServer().pipe(
    tap(v => { if (v.result) setVersion(v.result) }),
    tap(_ => { console.warn('after WalletTS.WaitForServer()', _) }),
    switchMap(_ => InitializeWalletState()),
    switchMap(_ => InitializeServices()),
    tap(_ => { console.warn(' after WaitForServerAndInitializeAll()')}),
    )
}

/** Detect that backend is available and ready for interaction */
export function WaitForServer(): Observable<ServerResponse<VersionResponse>> {
  if (DEBUG) console.debug('WaitForServer()')
  return <Observable<ServerResponse<VersionResponse>>> PollingLoopObs()
}

/** Load all data in WalletState */
export function InitializeWalletState() { // TODO : Rename
  return forkJoin([
    getServerVersion(),
    getInfo(),
    getTorDLCHostAddress(),
    getFeeEstimate(),
  ]).pipe(tap(results => {
    if (DEBUG) console.debug('InitializeWalletState()', results)
  }))
}

/** Initialize state for all underlying services */
export function InitializeServices() {
  if (DEBUG) console.debug('InitializeServices()')
  return forkJoin([
    Addresses.initialize(),
    Contacts.initialize(),
    DLCs.initialize(),
    Offers.initialize(),
  ]).pipe(tap(r => {
    if (DEBUG) console.debug('after InitializeServices()')
  }))
}

/** Observable wrapped GetVersion() state fn */
function getServerVersion() {
  return from(<Promise<ServerResponse<VersionResponse>>>GetVersion()).pipe(tap(r => {
    if (r.result) {
      setVersion(r.result)
    }
  }))
}
function setVersion(version: VersionResponse) {
  console.debug('setVersion()', version)
  const s = state.getValue()
  const v = version.version
  s.version = v
  const m = v.match(/([.\w]+-[.\w]+-[.\w]+)/)
  if (m && m.length > 0) s.shortServerVersion = m[0] 
  else s.shortServerVersion = v
  state.next(s)
}

function getInfo() {
  return from(GetInfo()).pipe(tap(r => {
    if (r.result) {
      if (DEBUG) console.debug('getInfo()', r.result)
      const s = state.getValue()
      s.info = r.result
      state.next(s)
    }
  }))
}

function getTorDLCHostAddress() {
  return from(GetDLCHostAddress()).pipe(tap(r => {
    if (r.result) {
      if (DEBUG) console.debug('getTorDLCHostAddress()', r.result)
      const s = state.getValue()
      s.torDLCHostAddress = r.result
      state.next(s)
    }
  }))
}

function getFeeEstimate() {
  return from(EstimateFee()).pipe(tap(r => {
    if (r.result) {
      if (DEBUG) console.debug('getFeeEstimate()', r.result)
      const s = state.getValue()
      if (r.result && r.result !== FEE_RATE_NOT_SET) {
        s.feeEstimate = r.result
      } else {
        s.feeEstimate = DEFAULT_FEE_RATE
      }
      state.next(s)
    }
  }))
}

/** Blockchain functions */

export function GetBlockCount(): Promise<ServerResponse<number>> {
  if (DEBUG) console.debug('GetBlockCount()')

  const m = getMessageBody(BlockchainMessageType.getblockcount)
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function GetFilterCount(): Promise<ServerResponse<number>> {
  if (DEBUG) console.debug('GetFilterCount()')

  const m = getMessageBody(BlockchainMessageType.getfiltercount)
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function GetFilterHeaderCount(): Promise<ServerResponse<number>> {
  if (DEBUG) console.debug('GetFilterHeaderCount()')

  const m = getMessageBody(BlockchainMessageType.getfilterheadercount)
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function GetBlockHeader(sha256hash: string): Promise<ServerResponse<BlockHeaderResponse>> {
  if (DEBUG) console.debug('GetBlockHeader()', sha256hash)
  validateString(sha256hash, 'GetBlockHeader()', 'sha256hash')

  const m = getMessageBody(BlockchainMessageType.getblockheader, [sha256hash])
  return SendServerMessage(m).then(response => {
    // returns "failure" for not found, needs error wrapped
    return response
  })
}

export function GetInfo(): Promise<ServerResponse<GetInfoResponse>> {
  if (DEBUG) console.debug('GetInfo()')

  const m = getMessageBody(BlockchainMessageType.getinfo)
  return SendServerMessage(m).then(response => {
    return response
  })
}

/** Network message functions */

export function GetPeers(): Promise<ServerResponse<string>> {
  if (DEBUG) console.debug('GetPeers()')

  const m = getMessageBody(NetworkMessageType.getpeers)
  return SendServerMessage(m).then(response => {
    // Current response: 'TODO implement getpeers'
    return response
  })
}

export function Stop(): Promise<ServerResponse<string>> {
  if (DEBUG) console.debug('Stop()')

  const m = getMessageBody(NetworkMessageType.stop)
  return SendServerMessage(m).then(response => {
    // Current response: 'Node shutting down'
    return response
  })
}

// export function DecodeRawTransaction() {
//   console.debug('GetFilterHeaderCount()')

//   const m = getMessageBody(BlockchainMessageType.decoderawtransaction)
//   return SendOracleMessage(m).then(response => {
//     return <ServerResponse<VersionResponse>>response
//   })
// }

/** Specific Server message functions */

export function IsEmpty(): Promise<ServerResponse<boolean>> {
  if (DEBUG) console.debug('IsEmpty()')

  const m = getMessageBody(WalletMessageType.isempty)
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function WalletInfo(): Promise<ServerResponse<WalletInfo>> {
  if (DEBUG) console.debug('WalletInfo()')

  const m = getMessageBody(WalletMessageType.walletinfo)
  return SendServerMessage(m).then(response => {
    return response
  })
}

// Do we want this to just return a number vs string with label?
export function GetBalance(inSats: boolean): Promise<ServerResponse<string>> {
  if (DEBUG) console.debug('GetBalance()', inSats)
  validateBoolean(inSats, 'GetBalance()', 'inSats')

  const m = getMessageBody(WalletMessageType.getbalance, [inSats])
  return SendServerMessage(m).then(response => {
    // This comes with ' sats' or ' BTC' label
    return response
  })
}

// Do we want this to just return a number vs string with label?
export function GetConfirmedBalance(inSats: boolean): Promise<ServerResponse<string>> {
  if (DEBUG) console.debug('GetConfirmedBalance()', inSats)
  validateBoolean(inSats, 'GetConfirmedBalance()', 'inSats')

  const m = getMessageBody(WalletMessageType.getconfirmedbalance, [inSats])
  return SendServerMessage(m).then(response => {
    // This comes with ' sats' or ' BTC' label
    return response
  })
}

// Do we want this to just return a number vs string with label?
export function GetUnconfirmedBalance(inSats: boolean): Promise<ServerResponse<string>> {
  if (DEBUG) console.debug('GetUnconfirmedBalance()', inSats)
  validateBoolean(inSats, 'GetUnconfirmedBalance()', 'inSats')

  const m = getMessageBody(WalletMessageType.getunconfirmedbalance, [inSats])
  return SendServerMessage(m).then(response => {
    // This comes with ' sats' or ' BTC' label
    return response
  })
}

export function GetBalances(inSats: boolean): Promise<ServerResponse<Balances>> {
  if (DEBUG) console.debug('GetBalances()', inSats)
  validateBoolean(inSats, 'GetBalances()', 'inSats')

  const m = getMessageBody(WalletMessageType.getbalances, [inSats])
  return SendServerMessage(m).then(response => {
    // This comes with ' sats' or ' BTC' label
    return response
  })
}

// // Should it be possible to create a new address without a label?
// export function GetNewAddress(label?: string): Promise<ServerResponse<string>> {
//   if (DEBUG) console.debug('GetNewAddress()', label)

//   if (label !== undefined) {
//     validateString(label, 'GetNewAddress()', 'label')

//     const m = getMessageBody(WalletMessageType.getnewaddress, [label])
//     return SendServerMessage(m).then(response => {
//       return response
//     })
//   } else {
//     const m = getMessageBody(WalletMessageType.getnewaddress)
//     return SendServerMessage(m).then(response => {
//       return response
//     })
//   }
// }

export function GetTransaction(sha256hash: string): Promise<ServerResponse<string>> {
  if (DEBUG) console.debug('GetTransaction()', sha256hash)
  validateString(sha256hash, 'GetTransaction()', 'sha256hash')

  const m = getMessageBody(WalletMessageType.gettransaction, [sha256hash])
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function LockUnspent(unlock: boolean, outPoints: any[]): Promise<ServerResponse<boolean>> {
  if (DEBUG) console.debug('LockUnspent()', unlock, outPoints)
  validateBoolean(unlock, 'LockUnspent()', 'unlock')
  // validateString(outPoints, 'LockUnspent()', 'outPoints')

  const m = getMessageBody(WalletMessageType.lockunspent, [unlock, outPoints])
  return SendServerMessage(m).then(response => {
    // boolean value === ?
    return response
  })
}

// export function LabelAddress(address: string, label: string): Promise<ServerResponse<string>> {
//   if (DEBUG) console.debug('LabelAddress()', address, label)
//   validateString(address, 'LabelAddress()', 'address')
//   validateString(label, 'LabelAddress()', 'label')

//   const m = getMessageBody(WalletMessageType.labeladdress, [address, label])
//   return SendServerMessage(m).then(response => {
//     // response like "Added label 'test label' to tb1qd8ap8lrzvvgw3k3wjfxcxsgz4wtspxysrs7a05",
//     return response
//   })
// }

// export function DropAddressLabel(address: string, label: string): Promise<ServerResponse<unknown>> {
//   if (DEBUG)  console.debug('DropAddressLabel()', address, label)
//   validateString(address, 'DropAddressLabel()', 'address')
//   validateString(label, 'DropAddressLabel()', 'label')

//   const m = getMessageBody(WalletMessageType.dropaddresslabel, [address, label])
//   return SendServerMessage(m).then(response => {
//     return response
//   })
// }

// export function GetAddressLabels(): Promise<ServerResponse<{ address: string, labels: string[] }[]>> {
//   if (DEBUG) console.debug('GetAddressLabels()')

//   const m = getMessageBody(WalletMessageType.getaddresslabels)
//   return SendServerMessage(m).then(response => {
//     return response
//   })
// }

// export function DropAddressLabels(address: string): Promise<ServerResponse<string>> {
//   if (DEBUG) console.debug('DropAddressLabels()', address)
//   validateString(address, 'DropAddressLabels()', 'address')

//   const m = getMessageBody(WalletMessageType.dropaddresslabels, [address])
//   return SendServerMessage(m).then(response => {
//     // response like '1 label dropped'
//     return response
//   })
// }

/** DLC Message Functions */

export function GetDLCHostAddress(): Promise<ServerResponse<string>> {
  if (DEBUG) console.debug('GetDLCHostAddress()')

  const m = getMessageBody(DLCMessageType.getdlchostaddress)
  return SendServerMessage(m).then(response => {
    // response like '0:0:0:0:0:0:0:0:2862'
    return response
  })
}

// payoutsVal: ContractDescriptorV0TLV / tlvPoints
export function CreateContractInfo(announcementTLV: string, totalCollateral: number, payoutsVal: any): Promise<ServerResponse<string>|string> {
  if (DEBUG) console.debug('CreateContractInfo()')

  const m = getMessageBody(DLCMessageType.createcontractinfo, [announcementTLV, totalCollateral, payoutsVal])
  return SendServerMessage(m).then(response => {
    // on fail returns "failure"
    return response
  })
}

// export function GetDLCs(contactAddress?: string): Promise<ServerResponse<DLCContract[]>> {
//   if (DEBUG) console.debug('GetDLCs()')

//   let params: any[]|undefined = undefined
//   if (contactAddress) {
//     params = [contactAddress]
//   }

//   const m = getMessageBody(WalletMessageType.getdlcs, params)
//   return SendServerMessage(m).then(response => {
//     return response
//   })
// }

// export function GetDLC(sha256hash: string): Promise<ServerResponse<DLCContract>> {
//   if (DEBUG) console.debug('GetDLC()', sha256hash)

//   const m = getMessageBody(WalletMessageType.getdlc, [sha256hash])
//   return SendServerMessage(m).then(response => {
//     return response
//   })
// }

// export function CancelDLC(sha256hash: string): Promise<ServerResponse<string>> {
//   if (DEBUG) console.debug('CancelDLC()', sha256hash)

//   const m = getMessageBody(WalletMessageType.canceldlc, [sha256hash])
//   return SendServerMessage(m).then(response => {
//     // result like 'Success'
//     return response
//   })
// }

// ContractInfoV0TLV
// collateral in sats
// feeRate in sats / vbyte
export function CreateDLCOffer(contractInfoTLV: string, collateral: number, feeRate: number, refundLT: number): Promise<ServerResponse<string>> {
  if (DEBUG) console.debug('CreateDLCOffer()', contractInfoTLV, collateral, feeRate, refundLT)
  validateString(contractInfoTLV, 'CreateDLCOffer()', 'contractInfoTLV')
  validateNumber(collateral, 'CreateDLCOffer()', 'collateral')
  validateNumber(feeRate, 'CreateDLCOffer()', 'feeRate')
  validateNumber(refundLT, 'CreateDLCOffer()', 'refundLT')
  const locktime = null //don't set locktime, see: https://github.com/bitcoin-s/bitcoin-s/issues/4721

  const m = getMessageBody(WalletMessageType.createdlcoffer, [contractInfoTLV, collateral, feeRate, locktime, refundLT])
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function GetDLCOffer(temporaryContractId: string): Promise<ServerResponse<string>> {
  if (DEBUG) console.debug('GetDLCOffer()', temporaryContractId)
  validateString(temporaryContractId, 'GetDLCOffer()', 'temporaryContractId')

  const m = getMessageBody(WalletMessageType.getdlcoffer, [temporaryContractId])
  return SendServerMessage(m).then(response => {
    // response is DLC offer message in hex
    return response
  })
}

export function AcceptDLCOffer(offerHex: string): Promise<ServerResponse<string>> {
  if (DEBUG) console.debug('AcceptDLCOffer()', offerHex)
  validateString(offerHex, 'AcceptDLCOffer()', 'offerHex')

  // Flexing via UI...
  //       2021-11-22T19:09:37.173Z error: onError socket hang up
  // [HPM] Error occurred while proxying request localhost:4200 to http://localhost:9999/ [ECONNRESET] (https://nodejs.org/api/errors.html#errors_common_system_errors)

  const m = getMessageBody(WalletMessageType.acceptdlcoffer, [offerHex])
  return SendServerMessage(m).then(response => {
    // response is DLC accept message in hex
    // example numeric amount size is 86k
    return response
  })
}

export function AcceptDLCOfferFromFile(path: string, destination?: string): Promise<ServerResponse<unknown>> {
  if (DEBUG) console.debug('AcceptDLCOfferFromFile()', path, destination)
  validateString(path, 'AcceptDLCOfferFromFile()', 'path')
  if (destination !== undefined) validateString(destination, 'AcceptDLCOfferFromFile()', 'destination')

  const args = [path]
  if (destination !== undefined) args.push(destination)

  const m = getMessageBody(WalletMessageType.acceptdlcofferfromfile, args)
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function SignDLC(acceptHex: string): Promise<ServerResponse<unknown>> {
  if (DEBUG) console.debug('SignDLC()', acceptHex)
  validateString(acceptHex, 'SignDLC()', 'acceptHex')

  const m = getMessageBody(WalletMessageType.signdlc, [acceptHex])
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function SignDLCFromFile(path: string, destination?: string): Promise<ServerResponse<unknown>> {
  if (DEBUG) console.debug('SignDLCFromFile()', path, destination)
  validateString(path, 'SignDLCFromFile()', 'path')
  if (destination !== undefined) validateString(destination, 'SignDLCFromFile()', 'destination')

  const args = [path]
  if (destination !== undefined) args.push(destination)

  const m = getMessageBody(WalletMessageType.signdlcfromfile, args)
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function AddDLCSigs(sigsHex: string): Promise<ServerResponse<unknown>> {
  if (DEBUG) console.debug('AddDLCSigs()', sigsHex)
  validateString(sigsHex, 'AddDLCSigs()', 'sigsHex')

  const m = getMessageBody(WalletMessageType.adddlcsigs, [sigsHex])
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function AddDLCSigsFromFile(path: string, destination?: string) {
  if (DEBUG) console.debug('AddDLCSigsFromFile()', path, destination)
  validateString(path, 'AddDLCSigsFromFile()', 'path')
  if (destination !== undefined) validateString(destination, 'AddDLCSigsFromFile()', 'destination')

  const args = [path]
  if (destination !== undefined) args.push(destination)

  const m = getMessageBody(WalletMessageType.adddlcsigsfromfile, args)
  return SendServerMessage(m).then(response => {
    return <ServerResponse<unknown>>response
  })
}

export function AddDLCSigsAndBroadcast(sigsHex: string) {
  if (DEBUG) console.debug('AddDLCSigsAndBroadcast()', sigsHex)
  validateString(sigsHex, 'AddDLCSigsAndBroadcast()', 'sigsHex')

  const m = getMessageBody(WalletMessageType.adddlcsigsandbroadcast, [sigsHex])
  return SendServerMessage(m).then(response => {
    // Return is txId
    return <ServerResponse<string>>response
  })
}

export function AddDLCSigsAndBroadcastFromFile(path: string, destination?: string): Promise<ServerResponse<unknown>> {
  if (DEBUG) console.debug('AddDLCSigsAndBroadcastFromFile()', path, destination)
  validateString(path, 'AddDLCSigsAndBroadcastFromFile()', 'path')
  if (destination !== undefined) validateString(destination, 'AddDLCSigsAndBroadcastFromFile()', 'destination')

  const args = [path]
  if (destination !== undefined) args.push(destination)

  const m = getMessageBody(WalletMessageType.adddlcsigsandbroadcastfromfile, args)
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function GetDLCFundingTx(contractIdHex: string): Promise<ServerResponse<unknown>> {
  console.debug('GetDLCFundingTx()', contractIdHex)
  validateString(contractIdHex, 'GetDLCFundingTx()', 'contractIdHex')

  const m = getMessageBody(WalletMessageType.getdlcfundingtx, [contractIdHex])
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function BroadcastDLCFundingTx(contractIdHex: string): Promise<ServerResponse<unknown>> {
  if (DEBUG) console.debug('BroadcastDLCFundingTx()', contractIdHex)
  validateString(contractIdHex, 'GetDLCFundingTx()', 'contractIdHex')

  const m = getMessageBody(WalletMessageType.broadcastdlcfundingtx, [contractIdHex])
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function ExecuteDLC(contractIdHex: string, oracleSigs: string[], noBroadcast: boolean): Promise<ServerResponse<string>> {
  if (DEBUG) console.debug('ExecuteDLC()', contractIdHex, oracleSigs, noBroadcast)
  validateString(contractIdHex, 'ExecuteDLC()', 'contractIdHex')
  // TODO : Validate oracleSigs
  validateBoolean(noBroadcast, 'ExecuteDLC()', 'noBroadcast')

  const m = getMessageBody(WalletMessageType.executedlc, [contractIdHex, oracleSigs, noBroadcast])
  return SendServerMessage(m).then(response => {
    // Return is closing txId
    return response
  })
}

export function ExecuteDLCRefund(contractIdHex: string, noBroadcast: boolean): Promise<ServerResponse<string>> {
  if (DEBUG) console.debug('ExecuteDLCRefund()', contractIdHex)
  validateString(contractIdHex, 'ExecuteDLC()', 'contractIdHex')
  validateBoolean(noBroadcast, 'ExecuteDLC()', 'noBroadcast')

  const m = getMessageBody(WalletMessageType.executedlcrefund, [contractIdHex, noBroadcast])
  return SendServerMessage(m).then(response => {
    // Return is txId
    return response
  })
}

export function SendToAddress(address: string, bitcoins: number, satsPerVByte: number, noBroadcast: boolean): Promise<ServerResponse<string>> {
  if (DEBUG) console.debug('SendToAddress()', address, bitcoins, satsPerVByte, noBroadcast)
  validateString(address, 'SendToAddress()', 'address')
  validateNumber(bitcoins, 'SendToAddress()', 'bitcoins')
  validateNumber(satsPerVByte, 'SendToAddress()', 'satsPerVByte')
  validateBoolean(noBroadcast, 'SendToAddress()', 'noBroadcast')

  const m = getMessageBody(WalletMessageType.sendtoaddress, [address, bitcoins, satsPerVByte, noBroadcast])
  return SendServerMessage(m).then(response => {
    // Return is txId
    return response
  })
}

export function SendFromOutpoints(outPoints: Outpoint[], bitcoins: number, satsPerVByte: number): Promise<ServerResponse<string>> {
  if (DEBUG) console.debug('SendFromOutpoints()', outPoints, bitcoins, satsPerVByte)
  // TODO : Validate outPoints[]
  validateNumber(bitcoins, 'SendFromOutpoints()', 'bitcoins')
  validateNumber(satsPerVByte, 'SendFromOutpoints()', 'satsPerVByte')

  const m = getMessageBody(WalletMessageType.sendfromoutpoints, [outPoints, bitcoins, satsPerVByte])
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function SweepWallet(address: string, satsPerVByte: number): Promise<ServerResponse<string>> {
  if (DEBUG) console.debug('SweepWallet()', address, satsPerVByte)
  validateString(address, 'SweepWallet()', 'address')
  validateNumber(satsPerVByte, 'SweepWallet()', 'satsPerVByte')

  const m = getMessageBody(WalletMessageType.dropaddresslabels, [address])
  return SendServerMessage(m).then(response => {
    // Return is txId
    return response
  })
}

export function SendWithAlgo(address: string, bitcoins: number, satsPerVByte: number, algo: string): Promise<ServerResponse<unknown>> {
  if (DEBUG) console.debug('SendWithAlgo()', address, bitcoins, satsPerVByte, algo)
  validateString(address, 'SendWithAlgo()', 'address')
  validateNumber(bitcoins, 'SendWithAlgo()', 'bitcoins')
  validateNumber(satsPerVByte, 'SendWithAlgo()', 'satsPerVByte')
  validateString(algo, 'SendWithAlgo()', 'algo')

  const m = getMessageBody(WalletMessageType.sendwithalgo, [address, bitcoins, satsPerVByte, algo])
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function SignPSBT(hexOrBase64: string): Promise<ServerResponse<unknown>> {
  if (DEBUG) console.debug('SignPSBT()', hexOrBase64)
  validateString(hexOrBase64, 'SignPSBT()', 'hexOrBase64')

  const m = getMessageBody(WalletMessageType.signpsbt, [hexOrBase64])
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function OpReturnCommit(message: string, hashMessage: boolean, satsPerVByte: number): Promise<ServerResponse<unknown>> {
  if (DEBUG) console.debug('OpReturnCommit()', message, hashMessage, satsPerVByte)
  validateString(message, 'OpReturnCommit()', 'message')
  validateBoolean(hashMessage, 'OpReturnCommit()', 'hashMessage')
  validateNumber(satsPerVByte, 'OpReturnCommit()', 'satsPerVByte')

  const m = getMessageBody(WalletMessageType.opreturncommit, [message, hashMessage, satsPerVByte])
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function BumpFeeRBF(sha256hash: string, satsPerVByte: number): Promise<ServerResponse<unknown>> {
  if (DEBUG) console.debug('BumpFeeRBF()', sha256hash, satsPerVByte)
  validateString(sha256hash, 'BumpFeeRBF()', 'sha256hash')
  validateNumber(satsPerVByte, 'BumpFeeRBF()', 'satsPerVByte')

  const m = getMessageBody(WalletMessageType.bumpfeerbf, [sha256hash, satsPerVByte])
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function BumpFeeCPFP(sha256hash: string, satsPerVByte: number): Promise<ServerResponse<unknown>> {
  if (DEBUG) console.debug('BumpFeeCPFP()', sha256hash, satsPerVByte)
  validateString(sha256hash, 'BumpFeeCPFP()', 'sha256hash')
  validateNumber(satsPerVByte, 'BumpFeeCPFP()', 'satsPerVByte')

  const m = getMessageBody(WalletMessageType.bumpfeecpfp, [sha256hash, satsPerVByte])
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function Rescan(batchSize: number|null, start: number|null, end: number|null, force: boolean, ignoreCreationTime: boolean): Promise<ServerResponse<string>> {
  if (DEBUG) console.debug('Rescan()', batchSize, start, end, force, ignoreCreationTime)
  if (batchSize !== null) validateNumber(batchSize, 'Rescan()', 'batchSize')
  if (start !== null) validateNumber(start, 'Rescan()', 'start')
  if (end !== null) validateNumber(end, 'Rescan()', 'end')
  validateBoolean(force, 'Rescan()', 'force')
  validateBoolean(ignoreCreationTime, 'Rescan()', 'ignoreCreationTime')

  const m = getMessageBody(WalletMessageType.rescan, [batchSize, start, end, force, ignoreCreationTime])
  return SendServerMessage(m).then(response => {
    // result like "Rescan started."
    return response
  })
}

export function GetUTXOs(): Promise<ServerResponse<UTXO[]>> {
  if (DEBUG) console.debug('GetUTXOs()')

  const m = getMessageBody(WalletMessageType.getutxos)
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function ListReservedUTXOs(): Promise<ServerResponse<UTXO[]>> {
  if (DEBUG) console.debug('ListReservedUTXOs()')

  const m = getMessageBody(WalletMessageType.listreservedutxos)
  return SendServerMessage(m).then(response => {
    return response
  })
}

// export function GetAddresses(): Promise<ServerResponse<string[]>> {
//   if (DEBUG) console.debug('GetAddresses()')

//   const m = getMessageBody(WalletMessageType.getaddresses)
//   return SendServerMessage(m).then(response => {
//     return response
//   })
// }

// export function GetSpentAddresses(): Promise<ServerResponse<string[]>> {
//   if (DEBUG) console.debug('GetSpentAddresses()')

//   const m = getMessageBody(WalletMessageType.getspentaddresses)
//   return SendServerMessage(m).then(response => {
//     return response
//   })
// }

// export function GetFundedAddresses(): Promise<ServerResponse<FundedAddress[]>> {
//   if (DEBUG) console.debug('GetFundedAddresses()')

//   const m = getMessageBody(WalletMessageType.getfundedaddresses)
//   return SendServerMessage(m).then(response => {
//     return response
//   })
// }

// export function GetUnusedAddresses(): Promise<ServerResponse<string[]>> {
//   if (DEBUG) console.debug('GetUnusedAddresses()')

//   const m = getMessageBody(WalletMessageType.getunusedaddresses)
//   return SendServerMessage(m).then(response => {
//     return response
//   })
// }

export function GetAccounts(): Promise<ServerResponse<string[]>> {
  if (DEBUG)  console.debug('GetAccounts()')

  const m = getMessageBody(WalletMessageType.getaccounts)
  return SendServerMessage(m).then(response => {
    // response like ['tpub...','vpub...','upub...']
    return response
  })
}

export function GetAddressInfo(address: string): Promise<ServerResponse<AddressInfo>> {
  if (DEBUG) console.debug('GetAddressInfo()', address)

  const m = getMessageBody(WalletMessageType.getaddressinfo, [address])
  return SendServerMessage(m).then(response => {
    return response
  })
}

// THIS IS UNTESTED
export function CreateNewAccount(): Promise<ServerResponse<unknown>> {
  if (DEBUG) console.debug('CreateNewAccount()')

  const m = getMessageBody(WalletMessageType.createnewaccount)
  return SendServerMessage(m).then(response => {
    // response like 
    return response
  })
}

// keymanagerpassphrasechange
// keymanagerpassphraseset

export function ImportSeed(walletName: string, mnemonic: string, passphrase?: string): Promise<ServerResponse<unknown>> {
  if (DEBUG) console.debug('ImportSeed()', walletName) // not logging mnemonic, passphrase
  validateString(walletName, 'ImportSeed()', 'walletName')
  validateString(mnemonic, 'ImportSeed()', 'mnemonic')
  if (passphrase !== undefined) validateString(passphrase, 'ImportSeed()', 'passphrase')

  const m = getMessageBody(WalletMessageType.importseed, [walletName, mnemonic, passphrase])
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function ImportXprv(walletName: string, mnemonic: string, passphrase?: string): Promise<ServerResponse<unknown>> {
  if (DEBUG) console.debug('ImportXprv()', walletName) // not logging mnemonic, passphrase
  validateString(walletName, 'ImportXprv()', 'walletName')
  validateString(mnemonic, 'ImportXprv()', 'mnemonic')
  if (passphrase !== undefined) validateString(passphrase, 'ImportXprv()', 'passphrase')

  const m = getMessageBody(WalletMessageType.importxprv, [walletName, mnemonic, passphrase])
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function LoadWallet(walletName?: string, passphrase?: string): Promise<ServerResponse<string>> {
  if (DEBUG) console.debug('LoadWallet()', walletName) // not logging passphrase
  if (walletName !== undefined) validateString(walletName, 'LoadWallet()', 'walletName')
  if (passphrase !== undefined) validateString(passphrase, 'LoadWallet()', 'passphrase')

  const m = getMessageBody(WalletMessageType.loadwallet, [walletName, passphrase])
  return SendServerMessage(m).then(response => {
    // Returns walletName
    return response
  })
}

// undefined walletName is default wallet
export function ExportSeed(walletName?: string, passphrase?: string): Promise<ServerResponse<string[]>> {
  if (DEBUG) console.debug('ExportSeed()', walletName) // not logging passphrase
  if (walletName !== undefined) validateString(walletName, 'ExportSeed()', 'walletName')
  if (passphrase !== undefined) validateString(passphrase, 'ExportSeed()', 'passphrase')

  const m = getMessageBody(WalletMessageType.exportseed, [walletName, passphrase]) // , [walletName, passphrase]
  return SendServerMessage(m).then(response => {
    return response
  })
}

// undefined walletName is default wallet
export function GetSeedBackupTime(walletName?: string, passphrase?: string): Promise<ServerResponse<unknown>> {
  if (DEBUG) console.debug('GetSeedBackupTime()', walletName) // not logging passphrase
  if (walletName !== undefined) validateString(walletName, 'GetSeedBackupTime()', 'walletName')
  if (passphrase !== undefined) validateString(passphrase, 'GetSeedBackupTime()', 'passphrase')

  const m = getMessageBody(WalletMessageType.getseedbackuptime, [walletName, passphrase])
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function SendRawTransaction(hex: string): Promise<ServerResponse<string>> {
  if (DEBUG) console.debug('SendRawTransaction()', hex)
  validateString(hex, 'SendRawTransaction()', 'hex')

  const m = getMessageBody(WalletMessageType.sendrawtransaction, [hex])
  return SendServerMessage(m).then(response => {
    // Returns txId
    return response
  })
}

export function EstimateFee(): Promise<ServerResponse<number>> {
  if (DEBUG) console.debug('EstimateFee()')

  const m = getMessageBody(WalletMessageType.estimatefee)
  return SendServerMessage(m).then(response => {
    // response like 1, -1 is 'unknown'/'not set'
    return response
  })
}

export function GetDLCWalletAccounting(): Promise<ServerResponse<DLCWalletAccounting>> {
  if (DEBUG) console.debug('GetDLCWalletAccounting()')

  const m = getMessageBody(WalletMessageType.getdlcwalletaccounting)
  return SendServerMessage(m).then(response => {
    return response
  })
}

// Do we want to support getting this back as a json payload?
export function BackupWallet(path: string): Promise<ServerResponse<string>> {
  if (DEBUG) console.debug('BackupWallet()', path)
  validateString(path, 'BackupWallet()', 'path')

  const m = getMessageBody(WalletMessageType.backupwallet, [path])
  return SendServerMessage(m).then(response => {
    // result: 'done'
    return response
  })
}

/** Core Route Functions */

export function FinalizePSBT(): Promise<ServerResponse<unknown>> {
  if (DEBUG) console.debug('FinalizePSBT()')

  const m = getMessageBody(CoreMessageType.finalizepsbt)
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function ExtractFromPSBT(): Promise<ServerResponse<unknown>> {
  if (DEBUG) console.debug('ExtractFromPSBT()')

  const m = getMessageBody(CoreMessageType.extractfrompsbt)
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function ConvertToPSBT(): Promise<ServerResponse<unknown>> {
  if (DEBUG) console.debug('ConvertToPSBT()')

  const m = getMessageBody(CoreMessageType.converttopsbt)
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function CombinePSBT(): Promise<ServerResponse<unknown>> {
  if (DEBUG) console.debug('CombinePSBT()')

  const m = getMessageBody(CoreMessageType.combinepsbts)
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function JoinPSBTs(): Promise<ServerResponse<unknown>> {
  if (DEBUG) console.debug('JoinPSBTs()')

  const m = getMessageBody(CoreMessageType.joinpsbts)
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function DecodePSBT(): Promise<ServerResponse<unknown>> {
  if (DEBUG) console.debug('DecodePSBT()')

  const m = getMessageBody(CoreMessageType.decodepsbt)
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function DecodeRawTransaction() {
  if (DEBUG) console.debug('DecodeRawTransaction()')

  const m = getMessageBody(CoreMessageType.decoderawtransaction)
  return SendServerMessage(m).then(response => {
    return <ServerResponse<unknown>>response
  })
}

export function AnalyzePSBT(): Promise<ServerResponse<unknown>> {
  if (DEBUG) console.debug('AnalyzePSBT()')

  const m = getMessageBody(CoreMessageType.analyzepsbt)
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function DecodeSign(signedHex: string): Promise<ServerResponse<Sign>> {
  console.debug('DecodeSign()', signedHex)
  validateString(signedHex, 'DecodeSign()', 'signedHex')

  const m = getMessageBody(CoreMessageType.decodesign, [signedHex])
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function DecodeAccept(acceptHex: string): Promise<ServerResponse<Accept>> {
  if (DEBUG) console.debug('DecodeAccept()', acceptHex)
  validateString(acceptHex, 'DecodeAccept()', 'acceptHex')

  const m = getMessageBody(CoreMessageType.decodeaccept, [acceptHex])
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function DecodeOffer(offerHex: string): Promise<ServerResponse<Offer>> {
  if (DEBUG)  console.debug('DecodeOffer()' /*, offerHex*/)
  validateString(offerHex, 'DecodeOffer()', 'offerHex')

  const m = getMessageBody(CoreMessageType.decodeoffer, [offerHex])
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function DecodeContractInfo(contractInfoHex: string): Promise<ServerResponse<ContractInfo>> {
  if (DEBUG) console.debug('DecodeContractInfo()' /*, contractInfoHex*/)
  validateString(contractInfoHex, 'DecodeContractInfo()', 'contractInfoHex')

  const m = getMessageBody(CoreMessageType.decodecontractinfo, [contractInfoHex])
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function DecodeAnnouncement(announcementHex: string): Promise<ServerResponse<Announcement>> {
  if (DEBUG) console.debug('DecodeAnnouncement()', announcementHex)
  validateString(announcementHex, 'DecodeAnnouncement()', 'announcementHex')

  const m = getMessageBody(CoreMessageType.decodeannouncement, [announcementHex])
  return SendServerMessage(m).then(response => {
    return response
  })
}

// 'failure' on error
export function DecodeAttestments(attestmentHex: string): Promise<ServerResponse<Attestment>> {
  if (DEBUG) console.debug('DecodeAttestments()', attestmentHex)
  validateString(attestmentHex, 'DecodeAttestments()', 'attestmentHex')

  const m = getMessageBody(CoreMessageType.decodeattestments, [attestmentHex])
  return SendServerMessage(m).then(response => {
    return response
  })
}

export function CreateMultiSig(): Promise<ServerResponse<unknown>> {
  if (DEBUG) console.debug('CreateMultiSig()')

  const m = getMessageBody(CoreMessageType.createmultisig)
  return SendServerMessage(m).then(response => {
    return response
  })
}

/** Offers */

// export function OfferList(): Promise<ServerResponse<IncomingOffer[]>> {
//   if (DEBUG) console.debug('OfferList()')

//   const m = getMessageBody(WalletMessageType.offerslist)
//   return SendServerMessage(m).then(response => {
//     return response
//   })
// }

// export function OfferAdd(offerTLV: string, peer: string, message: string): Promise<ServerResponse<string>> {
//   if (DEBUG) console.debug('OfferAdd()', peer, message)
//   validateString(offerTLV, 'OfferAdd()', 'offerTLV')
//   validateString(peer, 'OfferAdd()', 'peer')
//   validateString(message, 'OfferAdd()', 'message')

//   const m = getMessageBody(WalletMessageType.offeradd, [offerTLV, peer, message])
//   return SendServerMessage(m).then(response => {
//     // Returns hash.hex
//     return response
//   })
// }

// export function OfferRemove(hash: string): Promise<ServerResponse<string>> {
//   if (DEBUG) console.debug('OfferRemove()', hash)
//   validateString(hash, 'OfferRemove()', 'hash')

//   const m = getMessageBody(WalletMessageType.offerremove, [hash])
//   return SendServerMessage(m).then(response => {
//     // Returns hash.hex
//     return response
//   })
// }

/** Contacts */

// export function ContactList(): Promise<ServerResponse<Contact[]>> {
//   if (DEBUG) console.debug('ContactList()')

//   const m = getMessageBody(WalletMessageType.contactslist)
//   return SendServerMessage(m).then(response => {
//     return response
//   })
// }

// export function ContactAdd(alias: string, address: string, memo: string): Promise<ServerResponse<string>> {
//   if (DEBUG) console.debug('ContactAdd()', alias, address, memo)
//   validateString(alias, 'ContactAdd()', 'alias')
//   validateString(address, 'ContactAdd()', 'address')
//   validateString(memo, 'ContactAdd()', 'memo')

//   const m = getMessageBody(WalletMessageType.contactadd, [alias, address, memo])
//   return SendServerMessage(m).then(response => {
//     // Returns "ok"
//     return response
//   })
// }

// export function ContactRemove(address: string): Promise<ServerResponse<string>> {
//   if (DEBUG) console.debug('ContactRemove()', address)
//   validateString(address, 'ContactRemove()', 'address')

//   const m = getMessageBody(WalletMessageType.contactremove, [address])
//   return SendServerMessage(m).then(response => {
//     // Returns "ok"
//     return response
//   })
// }

// export function DLCContactAdd(dlcId: string, address: string): Promise<ServerResponse<string>> {
//   if (DEBUG)  console.debug('DLCContactAdd()', dlcId, address)
//   validateString(dlcId, 'DLCContactAdd()', 'dlcId')
//   validateString(address, 'DLCContactAdd()', 'address')

//   const m = getMessageBody(WalletMessageType.dlccontactadd, [dlcId, address])
//   return SendServerMessage(m).then(response => {
//     // Returns "ok"
//     return response
//   })
// }

// export function DLCContactRemove(dlcId: string): Promise<ServerResponse<string>> {
//   if (DEBUG) console.debug('DLCContactRemove()', dlcId)
//   validateString(dlcId, 'DLCContactRemove()', 'dlcId')

//   const m = getMessageBody(WalletMessageType.dlccontactremove, [dlcId])
//   return SendServerMessage(m).then(response => {
//     // Returns "ok"
//     return response
//   })
// }
