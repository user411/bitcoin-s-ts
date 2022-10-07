import { BehaviorSubject, forkJoin } from 'rxjs'
import { tap } from 'rxjs/operators'

import { SendServerMessage } from 'common-ts/index.js'
import { ServerResponse } from 'common-ts/type/server-types'
import { getMessageBody } from 'common-ts/util/message-util.js'
import { validateBoolean, validateNumber, validateString } from 'common-ts/util/validation-util.js'

import { FundedAddress, WalletMessageType } from '../type/wallet-types'


const DEBUG = true // log actions in console.debug

const _initialized: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false)
export function initialized() { return _initialized.value }
export const initialized$ = _initialized.asObservable()

const _fundedAddresses = new BehaviorSubject<FundedAddress[]>([])
export function fundedAddresses() { return _fundedAddresses.value }
export const fundedAddresses$ = _fundedAddresses.asObservable()
const _unfundedAddresses = new BehaviorSubject<string[]>([])
export function unfundedAddresses() { return _unfundedAddresses.value }
export const unfundedAddresses$ = _unfundedAddresses.asObservable()

const _addressLabelMap = new BehaviorSubject<{[address: string]: string[]}>({})
export function addressLabelMap() { return _addressLabelMap.value }
export const addressLabelMap$ = _addressLabelMap.asObservable()


export function initialize() {
  return forkJoin([
    refreshFundedAddresses(),
    refreshUnfundedAddresses(),
    refreshAddressLabels(),
  ]).pipe(tap(results => {
    if (DEBUG) console.debug('Addresses.initialize()', results)
    _initialized.next(true)
  }))
}

export function uninitialize() {
  _initialized.next(false)
  _fundedAddresses.next([])
  _unfundedAddresses.next([])
  _addressLabelMap.next({})
}

function refreshFundedAddresses() {
  return GetFundedAddresses().then(r => {
    if (r.result) {
      _fundedAddresses.next(r.result)
    } else { _fundedAddresses.next([]) }
    return _fundedAddresses.value
  })
}

function refreshUnfundedAddresses() {
  return GetUnusedAddresses().then(r => {
    if (r.result) {
      _unfundedAddresses.next(r.result)
    } else { _unfundedAddresses.next([]) }
    return _unfundedAddresses.value
  })
}

function refreshAddressLabels() {
  // return this.messageService.sendMessage(getMessageBody(WalletMessageType.getaddresslabels)).pipe(tap(r => {
  return GetAddressLabels().then(r => {
    // console.debug(' getaddresslabels', r)
    if (r.result) {
      const addressLabels: { address: string, labels: string[] }[] = r.result
      let map = {}
      if (addressLabels && addressLabels.length > 0) {
        for (const a of addressLabels) {
          map[a.address] = a.labels
        }
      }
      _addressLabelMap.next(map)
      return _addressLabelMap.value
      // console.debug(' addressLabelMap', this.addressLabelMap)
    }
  })
}

function updateAddressLabel(address: string, label: string) {
  return DropAddressLabels(address).then(r => LabelAddress(address, label)).then(r => {
    if (r.result) {
      _addressLabelMap[address] = [label]
      _addressLabelMap.next(_addressLabelMap.value)
    }
    return _addressLabelMap.value
  })
  // return this.messageService.sendMessage(getMessageBody(WalletMessageType.dropaddresslabels, [address])).pipe(tap(r => {
  //   // console.debug(' dropaddresslabels', r)
  // }), switchMap(r => {
  //   return this.messageService.sendMessage(getMessageBody(WalletMessageType.labeladdress, [address, label])).pipe(tap(r => {
  //     // console.debug(' labeladdress', r)
  //     if (r.result) {
  //       this.addressLabelMap[address] = [label]
  //     }
  //   }))
  // }))
}

/** API */

// Should it be possible to create a new address without a label?
export function GetNewAddress(label?: string): Promise<ServerResponse<string>> {
  if (DEBUG) console.debug('GetNewAddress()', label)

  if (label !== undefined) {
    validateString(label, 'GetNewAddress()', 'label')

    const m = getMessageBody(WalletMessageType.getnewaddress, [label])
    return SendServerMessage(m)
  } else {
    const m = getMessageBody(WalletMessageType.getnewaddress)
    return SendServerMessage(m)
  }
}

export function LabelAddress(address: string, label: string): Promise<ServerResponse<string>> {
  if (DEBUG) console.debug('LabelAddress()', address, label)
  validateString(address, 'LabelAddress()', 'address')
  validateString(label, 'LabelAddress()', 'label')

  const m = getMessageBody(WalletMessageType.labeladdress, [address, label])
  // response like "Added label 'test label' to tb1qd8ap8lrzvvgw3k3wjfxcxsgz4wtspxysrs7a05",
  return SendServerMessage(m)
}

export function DropAddressLabel(address: string, label: string): Promise<ServerResponse<unknown>> {
  if (DEBUG)  console.debug('DropAddressLabel()', address, label)
  validateString(address, 'DropAddressLabel()', 'address')
  validateString(label, 'DropAddressLabel()', 'label')

  const m = getMessageBody(WalletMessageType.dropaddresslabel, [address, label])
  return SendServerMessage(m)
}

export function GetAddressLabels(): Promise<ServerResponse<{ address: string, labels: string[] }[]>> {
  if (DEBUG) console.debug('GetAddressLabels()')

  const m = getMessageBody(WalletMessageType.getaddresslabels)
  return SendServerMessage(m)
}

export function DropAddressLabels(address: string): Promise<ServerResponse<string>> {
  if (DEBUG) console.debug('DropAddressLabels()', address)
  validateString(address, 'DropAddressLabels()', 'address')

  const m = getMessageBody(WalletMessageType.dropaddresslabels, [address])
  // response like '1 label dropped'
  return SendServerMessage(m)
}

export function GetAddresses(): Promise<ServerResponse<string[]>> {
  if (DEBUG) console.debug('GetAddresses()')

  const m = getMessageBody(WalletMessageType.getaddresses)
  return SendServerMessage(m)
}

export function GetSpentAddresses(): Promise<ServerResponse<string[]>> {
  if (DEBUG) console.debug('GetSpentAddresses()')

  const m = getMessageBody(WalletMessageType.getspentaddresses)
  return SendServerMessage(m)
}

export function GetFundedAddresses(): Promise<ServerResponse<FundedAddress[]>> {
  if (DEBUG) console.debug('GetFundedAddresses()')

  const m = getMessageBody(WalletMessageType.getfundedaddresses)
  return SendServerMessage(m)
}

export function GetUnusedAddresses(): Promise<ServerResponse<string[]>> {
  if (DEBUG) console.debug('GetUnusedAddresses()')

  const m = getMessageBody(WalletMessageType.getunusedaddresses)
  return SendServerMessage(m)
}

export const API = {
  GetNewAddress, LabelAddress, DropAddressLabel, GetAddressLabels, DropAddressLabels,
  GetAddresses, GetSpentAddresses, GetFundedAddresses, GetUnusedAddresses, 
};
