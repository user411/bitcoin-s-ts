import { BehaviorSubject, forkJoin, from } from 'rxjs'
import { tap } from 'rxjs/operators'

import { SendServerMessage } from 'common-ts/index.js'
import { ServerResponse } from 'common-ts/type/server-types'
import { getMessageBody } from 'common-ts/util/message-util.js'
import { validateBoolean, validateNumber, validateString } from 'common-ts/util/validation-util.js'
import { DLCContract, WalletMessageType } from '../type/wallet-types'
import { DLCContactAdd, DLCContactRemove } from './contact'
import { ContractInfo } from '../type/core-types'

import { DecodeContractInfo } from '..'

const DEBUG = true // log actions in console.debug

const _initialized: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false)
export function initialized() { return _initialized.value }
export const initialized$ = _initialized.asObservable()

const _dlcs: BehaviorSubject<DLCContract[]> = new BehaviorSubject<DLCContract[]>([])
export function dlcs() { return _dlcs.value }
export const dlcs$ = _dlcs.asObservable()

const _contractInfos: BehaviorSubject<{ [dlcId: string]: ContractInfo }> = 
  new BehaviorSubject<{ [dlcId: string]: ContractInfo }>({})
export function contractInfos() { return _contractInfos.value }
export const contractInfos$ = _contractInfos.asObservable()


export function initialize() {
  return forkJoin([
    // loadDLCs(),
    loadDLCs().then(dlcs => { console.warn('after loadDLCs()', dlcs); if (dlcs) loadContractInfos(dlcs); return dlcs }),
  ]).pipe(tap(results => {
    if (DEBUG) console.debug('DLCs.initialize()', results)
  }))
}

export function uninitialize() {
  _initialized.next(false)
  _dlcs.next([])
  _contractInfos.next({})
}

/** DLCs */

export function loadDLCs() {
  console.debug('loadDLCs()')
  return GetDLCs().then(r => {
    console.debug('loadDLCs()', r)
    if (r.result) {
      const dlcs = <DLCContract[]>r.result
      _dlcs.next(dlcs)
      // loadContractInfos(dlcs).subscribe()
      // loadContractInfos(dlcs)
      return dlcs
    }
  })
}


export function refreshDLC(dlcId: string) {
  console.debug('refreshDLCState()', dlcId)
  return GetDLC(dlcId).then(r => {
    console.debug('getdlc', r)
    if (r.result) {
      const dlc = <DLCContract>r.result
      // replaceDLC(dlc).subscribe()
      replaceDLCP(dlc)
      return dlc
    }
    return null
  })
}

export function refreshDLCObs(dlcId: string) { return from(refreshDLC(dlcId)) }

// Caller must subscribe to returned Observable to get new Contract Info loaded
// export function replaceDLC(dlc: DLCContract): Observable<any> {
//   // Inject in dlcs
//   const i = _dlcs.value.findIndex(d => d.dlcId === dlc.dlcId)
//   if (i !== -1) {
//     const removed = _dlcs.value.splice(i, 1, dlc)
//     // console.debug('removed:', removed)
//     _dlcs.next(_dlcs.value)
//     return of(null)
//   } else {
//     console.warn('replaceDLC() did not find dlcId', dlc.dlcId, 'in existing dlcs', dlc)
//     // Loading Contract Info before updating dlcs so data will be present for anything binding both
//     _dlcs.value.push(dlc)
//     _dlcs.next(_dlcs.value)
//     const obs = loadContractInfo(dlc)
//     return obs
//   }
// }

export function replaceDLCP(dlc: DLCContract) {
  // Inject in dlcs
  const i = _dlcs.value.findIndex(d => d.dlcId === dlc.dlcId)
  if (i !== -1) {
    const removed = _dlcs.value.splice(i, 1, dlc)
    // console.debug('removed:', removed)
    _dlcs.next(_dlcs.value)
    return Promise.resolve(undefined)
  } else {
    console.warn('replaceDLC() did not find dlcId', dlc.dlcId, 'in existing dlcs', dlc)
    // Loading Contract Info before updating dlcs so data will be present for anything binding both
    _dlcs.value.push(dlc)
    _dlcs.next(_dlcs.value)
    return loadContractInfo(dlc)
  }
}

export function removeDLC(dlcId: string) {
  const i = _dlcs.value.findIndex(d => d.dlcId === dlcId)
  if (i !== -1) {
    const removed = _dlcs.value.splice(i, 1)
    _dlcs.next(_dlcs.value)
  }
}

/** ContractInfo */

// function loadContractInfos(dlcs: DLCContract[]) {
//   console.debug('loadContractInfos()', dlcs.length)
//   const ci = _contractInfos.value
//   if (dlcs.length === 0) {
//     // No additional data to load
//     _initialized.next(true)
//   }
//   return forkJoin(dlcs.map(dlc => from(DecodeContractInfo(dlc.contractInfo))))
//     // this.messageService.sendMessage(getMessageBody(CoreMessageType.decodecontractinfo, [dlc.contractInfo]))))
//     .pipe(tap((results: ServerResponse<ContractInfo>[]) => {
//       // console.debug(' loadContractInfos()', results)
//       for (let i = 0; i < results.length; i++) {
//         ci[dlcs[i].dlcId] = <ContractInfo>results[i].result
//       }
//       _contractInfos.next(_contractInfos.value)
//       _initialized.next(true)
//     }))
// }

// function loadContractInfo(dlc: DLCContract) {
//   if (DEBUG) console.debug('loadContractInfo()')
//   const ci = _contractInfos.value
//   if (!ci[dlc.dlcId]) { // Don't bother reloading ContractInfo we already have
//     // const obs = this.messageService.sendMessage(getMessageBody(CoreMessageType.decodecontractinfo, [dlc.contractInfo]))
//     const obs = from(DecodeContractInfo(dlc.contractInfo))
//     .pipe(tap(r => {
//       if (DEBUG) console.debug(' loadContractInfo()', r)
//       if (r.result) {
//         ci[dlc.dlcId] = r.result
//         _contractInfos.next(_contractInfos.value)
//       }
//     }))
//     return obs
//   } else {
//     console.warn('loadContractInfo() already have Contract Info for', dlc.dlcId)
//     return of(null)
//   }
// }

function loadContractInfos(dlcs: DLCContract[]) {
  console.debug('loadContractInfos()', dlcs.length)
  const ci = _contractInfos.value
  if (dlcs.length === 0) {
    // No additional data to load
    _initialized.next(true)
  }

  return Promise.all(dlcs.map(dlc => DecodeContractInfo(dlc.contractInfo))).then(results => {
    for (let i = 0; i < results.length; i++) {
      ci[dlcs[i].dlcId] = <ContractInfo>results[i].result
    }
    _contractInfos.next(ci)
    _initialized.next(true)
    return ci
  })
}

function loadContractInfo(dlc: DLCContract) {
  if (DEBUG) console.debug('loadContractInfo()')
  const ci = _contractInfos.value
  if (!ci[dlc.dlcId]) { // Don't bother reloading ContractInfo we already have
    return DecodeContractInfo(dlc.contractInfo).then(r => {
      if (DEBUG) console.debug(' loadContractInfo()', r)
      if (r.result) {
        ci[dlc.dlcId] = r.result
        _contractInfos.next(_contractInfos.value)
        return r.result
      }
    })
  } else {
    console.warn('loadContractInfo() already have Contract Info for', dlc.dlcId)
    return Promise.resolve(undefined) // should this return existing value?
  }
}

// Should these move to Contacts?
/** Contacts */

export function addContact(dlc: DLCContract, address: string) {
  return DLCContactAdd(dlc.dlcId, address).then(r => {
  // return this.messageService.sendMessage(getMessageBody(WalletMessageType.dlccontactadd, [dlc.dlcId, address])).pipe(tap(r => {
    if (DEBUG) console.debug('dlccontactadd', r)
    if (r) {
      if (r.error) {
        // TODO
        // const dialog = this.dialog.open(ErrorDialogComponent, {
        //   data: {
        //     title: 'dialog.error',
        //     content: r.error,
        //   }
        // })
      } else if (r.result) { // "ok"
        dlc.peer = address
      }
    }
  })
}

export function removeContact(dlc: DLCContract) {
  return DLCContactRemove(dlc.dlcId).then(r => {
    if (DEBUG) console.debug('dlccontactremove', r)
    if (r) {
      if (r.error) {
        // TODO
        // const dialog = this.dialog.open(ErrorDialogComponent, {
        //   data: {
        //     title: 'dialog.error',
        //     content: r.error,
        //   }
        // })
      } else if (r.result) { // "ok"
        dlc.peer = <string><unknown>undefined
      }
    }
  })
}

/** API */

export function GetDLCs(contactAddress?: string): Promise<ServerResponse<DLCContract[]>> {
  if (DEBUG) console.debug('GetDLCs()')

  let params: any[]|undefined = undefined
  if (contactAddress) {
    validateString(contactAddress, 'GetDLCs()', 'contactAddress')
    params = [contactAddress]
  }

  const m = getMessageBody(WalletMessageType.getdlcs, params)
  return SendServerMessage(m)
}

export function GetDLC(sha256hash: string): Promise<ServerResponse<DLCContract>> {
  if (DEBUG) console.debug('GetDLC()', sha256hash)
  validateString(sha256hash, 'GetDLC()', 'sha256hash')

  const m = getMessageBody(WalletMessageType.getdlc, [sha256hash])
  return SendServerMessage(m)
}

export function CancelDLC(sha256hash: string): Promise<ServerResponse<string>> {
  if (DEBUG) console.debug('CancelDLC()', sha256hash)
  validateString(sha256hash, 'CancelDLC()', 'sha256hash')

  const m = getMessageBody(WalletMessageType.canceldlc, [sha256hash])
  // result like 'Success'
  return SendServerMessage(m)
}

export const API = {
  GetDLCs, GetDLC, CancelDLC, 
};
